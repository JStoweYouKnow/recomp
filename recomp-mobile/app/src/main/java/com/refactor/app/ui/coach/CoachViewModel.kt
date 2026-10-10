package com.refactor.app.ui.coach

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.refactor.app.api.ApiException
import com.refactor.app.api.CoachRepository
import com.refactor.app.api.RicoContextFactory
import com.refactor.app.api.SyncRepository
import com.refactor.app.api.dto.MenuPickDto
import com.refactor.app.api.dto.RegeneratePlanOptions
import com.refactor.app.api.dto.RestaurantPicksDto
import com.refactor.app.api.dto.RicoToolActionWire
import com.refactor.app.api.dto.RicoHistoryMessageDto
import com.refactor.app.api.dto.ScoredRecipeSuggestionDto
import com.refactor.app.api.stripRicoDiagnosticMarkup
import com.refactor.app.db.CoachMessageDao
import com.refactor.app.db.CoachMessageEntity
import com.refactor.app.db.SyncCacheDao
import com.refactor.app.widget.RecompWidgetUpdater
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.util.UUID

enum class ChatRole { User, Assistant }

data class ChatLine(val role: ChatRole, val content: String, val id: String = "")

class CoachViewModel(
    private val appContext: Context,
    private val coachRepository: CoachRepository,
    private val syncRepository: SyncRepository,
    private val syncCacheDao: SyncCacheDao,
    private val coachMessageDao: CoachMessageDao,
) : ViewModel() {

    val lines: StateFlow<List<ChatLine>> =
        coachMessageDao.observeMessages()
            .map { rows ->
                rows.map { e ->
                    ChatLine(
                        role = if (e.role == "user") ChatRole.User else ChatRole.Assistant,
                        content = e.content,
                        id = e.id,
                    )
                }
            }
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    /** Hint after auto-upload post-coach (optional). */
    private val _lastPushNote = MutableStateFlow<String?>(null)
    val lastPushNote: StateFlow<String?> = _lastPushNote.asStateFlow()

    /** Ref's restaurant picks keyed by assistant message id (this session; the reply text persists). */
    private val _restaurantPicks = MutableStateFlow<Map<String, RestaurantPicksDto>>(emptyMap())
    val restaurantPicks: StateFlow<Map<String, RestaurantPicksDto>> = _restaurantPicks.asStateFlow()

    /** "$messageId#${pick.name}" for picks already logged from chat. */
    private val _loggedPicks = MutableStateFlow<Set<String>>(emptySet())
    val loggedPicks: StateFlow<Set<String>> = _loggedPicks.asStateFlow()

    private val _regeneratingPlan = MutableStateFlow(false)
    val regeneratingPlan: StateFlow<Boolean> = _regeneratingPlan.asStateFlow()

    fun dismissError() {
        _error.value = null
    }

    fun dismissPushNote() {
        _lastPushNote.value = null
    }

    fun send(trimmed: String) {
        if (trimmed.isEmpty()) return
        viewModelScope.launch {
            _error.value = null
            _lastPushNote.value = null
            val ctx = syncCacheDao.getOnce()?.payloadJson?.let(RicoContextFactory::fromPayloadJson)
            val userId = UUID.randomUUID().toString()
            coachMessageDao.insert(
                CoachMessageEntity(
                    id = userId,
                    role = "user",
                    content = trimmed,
                    createdAtEpochMillis = System.currentTimeMillis(),
                ),
            )
            val history = coachMessageDao.listAllAsc().takeLast(RICO_HISTORY_MAX).map { row ->
                RicoHistoryMessageDto(
                    role = if (row.role == "user") "user" else "assistant",
                    content = stripRicoDiagnosticMarkup(row.content).take(RICO_CONTENT_MAX),
                    at = row.createdAtEpochMillis.toString(),
                )
            }
            _busy.value = true
            coachRepository.chat(trimmed, ctx, history).fold(
                onSuccess = { res ->
                    val serverHandledActions =
                        setOf("regenerate_plan", "suggest_recipes", "save_recipe_from_url", "recommend_restaurant_order")
                    val needsRegenerate = res.actions.any { it.type == "regenerate_plan" }
                    val localActions = res.actions.filter { it.type !in serverHandledActions }
                    val applyOutcome = if (localActions.isNotEmpty()) {
                        syncRepository.applyRicoActionsToCache(localActions).getOrElse { e ->
                            coachMessageDao.deleteById(userId)
                            _error.value = when (e) {
                                is ApiException -> e.message
                                else -> e.message ?: "Ref couldn't apply changes"
                            }
                            _busy.value = false
                            return@launch
                        }
                    } else {
                        null
                    }
                    if (res.recipeSaved != null) {
                        syncRepository.mergeSavedRecipeIntoCache(res.recipeSaved).fold(
                            onSuccess = {
                                _lastPushNote.value = "Saved recipe to your library."
                            },
                            onFailure = { e ->
                                _lastPushNote.value = when (e) {
                                    is ApiException -> "Recipe saved on server — ${e.message ?: "sync later from Today."}"
                                    else -> "Recipe saved on server — upload from Today when connected."
                                }
                            },
                        )
                    }
                    if (needsRegenerate) {
                        val regenAction = res.actions.firstOrNull { it.type == "regenerate_plan" }
                        val regenOptions = regenAction?.let { RegeneratePlanOptions.fromPayload(it.payload) }
                            ?: RegeneratePlanOptions()
                        _regeneratingPlan.value = true
                        syncRepository.regeneratePlan(regenOptions).fold(
                            onSuccess = {
                                val weeks = regenOptions.programWeeks ?: 1
                                _lastPushNote.value =
                                    if (weeks > 1) "Your $weeks-week program is ready and synced."
                                    else "Your new plan is ready and synced."
                            },
                            onFailure = { e ->
                                _error.value = when (e) {
                                    is ApiException -> e.message
                                    else -> e.message ?: "Could not regenerate plan"
                                }
                            },
                        )
                        _regeneratingPlan.value = false
                    }
                    val applyResult = applyOutcome?.result
                    val assistantText = buildString {
                        append(stripRicoDiagnosticMarkup(res.reply.trim()))
                        res.recipeSuggestions?.takeIf { it.isNotEmpty() }?.let { list ->
                            if (isNotEmpty()) append("\n\n")
                            append(formatRecipeSuggestions(list))
                        }
                        if (needsRegenerate) {
                            if (isNotEmpty()) append("\n\n")
                            append("Started building your new plan.")
                        }
                        applyResult?.statusSuffix()?.takeIf { it.isNotBlank() }?.let { append(it) }
                    }
                    val assistantId = UUID.randomUUID().toString()
                    res.restaurantPicks?.takeIf { it.items.isNotEmpty() }?.let { picks ->
                        _restaurantPicks.value = _restaurantPicks.value + (assistantId to picks)
                    }
                    coachMessageDao.insert(
                        CoachMessageEntity(
                            id = assistantId,
                            role = "assistant",
                            content = assistantText.ifBlank { "…" },
                            createdAtEpochMillis = System.currentTimeMillis(),
                        ),
                    )
                    syncRepository.mergeCoachHistoryIntoCachedSnapshot(coachMessageDao)
                    syncRepository.pushCachedSnapshot().fold(
                        onSuccess = {
                            _lastPushNote.value = "Synced to server."
                        },
                        onFailure = { e ->
                            _lastPushNote.value = when (e) {
                                is ApiException -> "Saved offline — ${e.message ?: "upload later from Today."}"
                                else -> "Saved offline — upload from Today when connected."
                            }
                        },
                    )
                    if (applyOutcome?.changed == true) {
                        syncRepository.readCachedSnapshot()?.let { snap ->
                            RecompWidgetUpdater.updateFromSnapshot(appContext, snap)
                        } ?: RecompWidgetUpdater.refreshWidgets(appContext)
                    }
                },
                onFailure = { e ->
                    coachMessageDao.deleteById(userId)
                    _error.value = when (e) {
                        is ApiException -> e.message
                        else -> e.message ?: "Ref couldn't respond"
                    }
                },
            )
            _busy.value = false
        }
    }

    /** One-tap log of a restaurant pick — same local path as Ref's `log_meal`, then sync. */
    fun logRestaurantPick(messageId: String, restaurant: String, pick: MenuPickDto) {
        val key = "$messageId#${pick.name}"
        if (key in _loggedPicks.value) return
        _loggedPicks.value = _loggedPicks.value + key
        viewModelScope.launch {
            val hour = java.time.LocalTime.now().hour
            val mealType = when {
                hour < 11 -> "breakfast"
                hour < 16 -> "lunch"
                hour < 21 -> "dinner"
                else -> "snack"
            }
            val m = pick.estimatedMacros
            val action = RicoToolActionWire(
                type = "log_meal",
                payload = buildJsonObject {
                    put("name", "${pick.name} ($restaurant)")
                    put("mealType", mealType)
                    put("calories", m.calories)
                    put("protein", m.protein)
                    put("carbs", m.carbs)
                    put("fat", m.fat)
                },
            )
            syncRepository.applyRicoActionsToCache(listOf(action)).fold(
                onSuccess = { outcome ->
                    _lastPushNote.value = "Logged ${pick.name}."
                    syncRepository.pushCachedSnapshot()
                    if (outcome.changed) {
                        syncRepository.readCachedSnapshot()?.let { snap ->
                            RecompWidgetUpdater.updateFromSnapshot(appContext, snap)
                        } ?: RecompWidgetUpdater.refreshWidgets(appContext)
                    }
                },
                onFailure = { e ->
                    _loggedPicks.value = _loggedPicks.value - key
                    _error.value = e.message ?: "Couldn't log ${pick.name}"
                },
            )
        }
    }

    private fun formatRecipeSuggestions(suggestions: List<ScoredRecipeSuggestionDto>): String =
        suggestions.mapIndexed { index, s ->
            val link = s.recipeUrl?.let { " $it" } ?: ""
            "${index + 1}. ${s.name} (${s.calories} cal, ${s.protein}g P, score ${s.fitScore}) — ${s.fitReason}$link"
        }.joinToString("\n")

    class Factory(
        private val appContext: Context,
        private val coachRepository: CoachRepository,
        private val syncRepository: SyncRepository,
        private val syncCacheDao: SyncCacheDao,
        private val coachMessageDao: CoachMessageDao,
    ) : ViewModelProvider.Factory {
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            require(modelClass.isAssignableFrom(CoachViewModel::class.java))
            @Suppress("UNCHECKED_CAST")
            return CoachViewModel(
                appContext,
                coachRepository,
                syncRepository,
                syncCacheDao,
                coachMessageDao,
            ) as T
        }
    }

    private companion object {
        private const val RICO_HISTORY_MAX = 100
        private const val RICO_CONTENT_MAX = 10_000
    }
}
