package com.recomp.app.ui.meals

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.recomp.app.api.SyncJson
import com.recomp.app.api.SyncRepository
import com.recomp.app.api.MealPrepRepository
import com.recomp.app.api.dto.MealEntryDto
import com.recomp.app.api.dto.MealMacrosDto
import com.recomp.app.api.dto.MealPrepGenerateResponseDto
import com.recomp.app.api.dto.PantryItemDto
import com.recomp.app.api.dto.SyncGetResponse
import com.recomp.app.db.SyncCacheDao
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

class MealsViewModel(
    private val syncCacheDao: SyncCacheDao,
    private val syncRepository: SyncRepository,
    private val mealPrepRepository: MealPrepRepository,
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

    class Factory(
        private val dao: SyncCacheDao,
        private val syncRepository: SyncRepository,
        private val mealPrepRepository: MealPrepRepository,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            require(modelClass.isAssignableFrom(MealsViewModel::class.java))
            return MealsViewModel(dao, syncRepository, mealPrepRepository) as T
        }
    }
}
