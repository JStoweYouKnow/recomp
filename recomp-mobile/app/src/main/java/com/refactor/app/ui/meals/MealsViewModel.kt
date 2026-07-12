package com.refactor.app.ui.meals

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.refactor.app.api.MealPrepRepository
import com.refactor.app.api.MealRepository
import com.refactor.app.api.SyncJson
import com.refactor.app.api.SyncRepository
import com.refactor.app.api.dto.MealEntryDto
import com.refactor.app.api.dto.MealMacrosDto
import com.refactor.app.api.dto.MealPrepGenerateResponseDto
import com.refactor.app.api.dto.PantryItemDto
import com.refactor.app.api.dto.RecipeSuggestRequestDto
import com.refactor.app.api.dto.SavedRecipeDto
import com.refactor.app.api.dto.ScoredRecipeSuggestionDto
import com.refactor.app.api.dto.SyncGetResponse
import com.refactor.app.db.SyncCacheDao
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import java.time.LocalDate

class MealsViewModel(
    private val syncCacheDao: SyncCacheDao,
    private val syncRepository: SyncRepository,
    private val mealPrepRepository: MealPrepRepository,
    private val mealRepository: MealRepository,
) : ViewModel() {

    /** All meals from the cached sync snapshot (same source as iOS SwiftData + POST). */
    val allMeals = syncCacheDao.observe()
        .map { entity ->
            val raw = entity?.payloadJson ?: return@map emptyList()
            runCatching {
                SyncJson.format.decodeFromString<SyncGetResponse>(raw)
                    .meals.orEmpty()
            }.getOrElse { emptyList() }
        }
        .map { list ->
            list.sortedWith(
                compareByDescending<MealEntryDto> { it.date }
                    .thenByDescending { it.id },
            )
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val allSavedRecipes = syncCacheDao.observe()
        .map { entity ->
            val raw = entity?.payloadJson ?: return@map emptyList()
            runCatching {
                SyncJson.format.decodeFromString<SyncGetResponse>(raw)
                    .savedRecipes.orEmpty()
            }.getOrElse { emptyList() }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    private val _recipeSuggestions = MutableStateFlow<List<ScoredRecipeSuggestionDto>>(emptyList())
    val recipeSuggestions: StateFlow<List<ScoredRecipeSuggestionDto>> = _recipeSuggestions.asStateFlow()

    private val _recipeStatus = MutableStateFlow<String?>(null)
    val recipeStatus: StateFlow<String?> = _recipeStatus.asStateFlow()

    private val _recipeBusy = MutableStateFlow(false)
    val recipeBusy: StateFlow<Boolean> = _recipeBusy.asStateFlow()

    private val _snapshot = syncCacheDao.observe()
        .map { entity ->
            val raw = entity?.payloadJson ?: return@map null
            runCatching { SyncJson.format.decodeFromString<SyncGetResponse>(raw) }.getOrNull()
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    val snapshot = _snapshot

    val allPantry = syncCacheDao.observe()
        .map { entity ->
            val raw = entity?.payloadJson ?: return@map emptyList()
            runCatching {
                SyncJson.format.decodeFromString<SyncGetResponse>(raw)
                    .pantry.orEmpty()
            }.getOrElse { emptyList() }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    private val _mealPrep = MutableStateFlow<MealPrepGenerateResponseDto?>(null)
    val mealPrepResult: StateFlow<MealPrepGenerateResponseDto?> = _mealPrep.asStateFlow()

    private val _mealPrepError = MutableStateFlow<String?>(null)
    val mealPrepError: StateFlow<String?> = _mealPrepError.asStateFlow()

    fun clearMealPrepError() {
        _mealPrepError.value = null
    }

    fun generateMealPrep(preferences: String?) {
        viewModelScope.launch {
            _mealPrepError.value = null
            val raw = syncCacheDao.getOnce()?.payloadJson
            if (raw == null) {
                _mealPrepError.value = "Refresh Today tab first to load sync data."
                return@launch
            }
            val snap = runCatching { SyncJson.format.decodeFromString<SyncGetResponse>(raw) }.getOrElse {
                _mealPrepError.value = it.message
                return@launch
            }
            val targets = snap.plan?.dietPlan?.dailyTargets ?: MealMacrosDto()
            val restrictions = snap.profile.dietaryRestrictions
            val pantryNames = snap.pantry.orEmpty().map { it.name }
            mealPrepRepository.generate(targets, restrictions, pantryNames, preferences).fold(
                onSuccess = { _mealPrep.value = it },
                onFailure = { _mealPrepError.value = it.message ?: "Meal prep failed" },
            )
        }
    }

    suspend fun persistPantryAndPush(pantry: List<PantryItemDto>): Result<Unit> {
        val local = syncRepository.mutateCachedSnapshot { it.copy(pantry = pantry) }
        if (local.isFailure) return Result.failure(local.exceptionOrNull()!!)
        return syncRepository.pushCachedSnapshot()
    }

    suspend fun persistMealsAndPush(meals: List<MealEntryDto>): Result<Unit> {
        val local = syncRepository.mutateCachedSnapshot { it.copy(meals = meals) }
        if (local.isFailure) return Result.failure(local.exceptionOrNull()!!)
        return syncRepository.pushCachedSnapshot()
    }

    /** Pulls a fresh snapshot from the server so the Room cache is current before any mutation. */
    suspend fun refreshSnapshot(): Result<Unit> = syncRepository.fetchSnapshot().map {}

    fun clearRecipeStatus() {
        _recipeStatus.value = null
    }

    fun suggestRecipes() {
        viewModelScope.launch {
            _recipeBusy.value = true
            _recipeStatus.value = null
            val snap = syncCacheDao.getOnce()?.payloadJson?.let { raw ->
                runCatching { SyncJson.format.decodeFromString<SyncGetResponse>(raw) }.getOrNull()
            }
            if (snap == null) {
                _recipeStatus.value = "Refresh Today tab first to load sync data."
                _recipeBusy.value = false
                return@launch
            }
            val today = LocalDate.now().toString()
            val todayMeals = snap.meals.orEmpty().filter { it.date.take(10) == today }
            val targets = snap.plan?.dietPlan?.dailyTargets ?: MealMacrosDto()
            val consumed = todayMeals.fold(MealMacrosDto()) { acc, meal ->
                MealMacrosDto(
                    calories = acc.calories + meal.macros.calories,
                    protein = acc.protein + meal.macros.protein,
                    carbs = acc.carbs + meal.macros.carbs,
                    fat = acc.fat + meal.macros.fat,
                )
            }
            mealRepository.suggestRecipes(
                RecipeSuggestRequestDto(
                    macroTargets = targets,
                    todayMacros = consumed,
                    goal = snap.profile.goal,
                    includeDiscover = true,
                ),
            ).fold(
                onSuccess = { list ->
                    _recipeSuggestions.value = list
                    if (list.isEmpty()) _recipeStatus.value = "No recipe matches right now."
                },
                onFailure = { e ->
                    _recipeSuggestions.value = emptyList()
                    _recipeStatus.value = e.message ?: "Could not rank recipes"
                },
            )
            _recipeBusy.value = false
        }
    }

    fun saveRecipeFromUrl(url: String) {
        val trimmed = url.trim()
        if (trimmed.isEmpty()) return
        viewModelScope.launch {
            _recipeBusy.value = true
            _recipeStatus.value = null
            mealRepository.saveRecipeFromUrl(trimmed).fold(
                onSuccess = { recipe ->
                    persistSavedRecipeAndPush(recipe).fold(
                        onSuccess = { _recipeStatus.value = "Saved ${recipe.name}" },
                        onFailure = { e -> _recipeStatus.value = e.message ?: "Saved locally but sync failed" },
                    )
                },
                onFailure = { e -> _recipeStatus.value = e.message ?: "Could not save recipe" },
            )
            _recipeBusy.value = false
        }
    }

    suspend fun persistSavedRecipesAndPush(recipes: List<SavedRecipeDto>): Result<Unit> {
        val local = syncRepository.mutateCachedSnapshot { it.copy(savedRecipes = recipes) }
        if (local.isFailure) return Result.failure(local.exceptionOrNull()!!)
        return syncRepository.pushCachedSnapshot()
    }

    private suspend fun persistSavedRecipeAndPush(recipe: SavedRecipeDto): Result<Unit> {
        val local = syncRepository.mutateCachedSnapshot { snap ->
            val existing = snap.savedRecipes.orEmpty()
            val deduped = existing.filter {
                (it.recipeUrl ?: "").lowercase() != (recipe.recipeUrl ?: "").lowercase() ||
                    (recipe.recipeUrl ?: "").isEmpty()
            }
            snap.copy(savedRecipes = (listOf(recipe) + deduped).take(500))
        }
        if (local.isFailure) return Result.failure(local.exceptionOrNull()!!)
        return syncRepository.pushCachedSnapshot()
    }

    class Factory(
        private val dao: SyncCacheDao,
        private val syncRepository: SyncRepository,
        private val mealPrepRepository: MealPrepRepository,
        private val mealRepository: MealRepository,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            require(modelClass.isAssignableFrom(MealsViewModel::class.java))
            return MealsViewModel(dao, syncRepository, mealPrepRepository, mealRepository) as T
        }
    }
}
