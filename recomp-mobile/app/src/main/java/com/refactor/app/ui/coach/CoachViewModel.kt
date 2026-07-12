package com.refactor.app.ui.coach

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.refactor.app.api.ApiException
import com.refactor.app.api.CoachRepository
import com.refactor.app.api.RicoContextFactory
import com.refactor.app.api.SyncRepository
import com.refactor.app.api.dto.RegeneratePlanOptions
import com.refactor.app.api.dto.ScoredRecipeSuggestionDto
import com.refactor.app.db.CoachMessageDao
import com.refactor.app.db.CoachMessageEntity
import com.refactor.app.db.SyncCacheDao
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.util.UUID

enum class ChatRole { User, Assistant }

data class ChatLine(val role: ChatRole, val content: String)

class CoachViewModel(
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
            _busy.value = true
            coachRepository.chat(trimmed, ctx).fold(
                onSuccess = { res ->
                    val serverHandledActions = setOf("regenerate_plan", "suggest_recipes", "save_recipe_from_url")
                    val needsRegenerate = res.actions.any { it.type == "regenerate_plan" }
                    val localActions = res.actions.filter { it.type !in serverHandledActions }
                    val applied = if (localActions.isNotEmpty()) {
                        syncRepository.applyRicoActionsToCache(localActions).getOrElse { false }
                    } else {
                        false
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
                    val assistantText = buildString {
                        append(res.reply.trim())
                        res.recipeSuggestions?.takeIf { it.isNotEmpty() }?.let { list ->
                            if (isNotEmpty()) append("\n\n")
                            append(formatRecipeSuggestions(list))
                        }
                        if (localActions.isNotEmpty() || needsRegenerate) {
                            if (isNotEmpty()) append("\n\n")
                            append(
                                when {
                                    needsRegenerate -> "Started building your new plan."
                                    applied -> "Applied ${localActions.size} change(s) to your offline snapshot."
                                    else -> "Ref couldn't apply all changes (missing plan, day, or exercise in cache)."
                                },
                            )
                        }
                    }
                    coachMessageDao.insert(
                        CoachMessageEntity(
                            id = UUID.randomUUID().toString(),
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

    private fun formatRecipeSuggestions(suggestions: List<ScoredRecipeSuggestionDto>): String =
        suggestions.mapIndexed { index, s ->
            val link = s.recipeUrl?.let { " $it" } ?: ""
            "${index + 1}. ${s.name} (${s.calories} cal, ${s.protein}g P, score ${s.fitScore}) — ${s.fitReason}$link"
        }.joinToString("\n")

    class Factory(
        private val coachRepository: CoachRepository,
        private val syncRepository: SyncRepository,
        private val syncCacheDao: SyncCacheDao,
        private val coachMessageDao: CoachMessageDao,
    ) : ViewModelProvider.Factory {
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            require(modelClass.isAssignableFrom(CoachViewModel::class.java))
            @Suppress("UNCHECKED_CAST")
            return CoachViewModel(
                coachRepository,
                syncRepository,
                syncCacheDao,
                coachMessageDao,
            ) as T
        }
    }
}
