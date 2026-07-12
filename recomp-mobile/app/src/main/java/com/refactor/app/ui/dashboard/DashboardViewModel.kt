package com.refactor.app.ui.dashboard

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.refactor.app.api.ApiException
import com.refactor.app.api.SyncRepository
import com.refactor.app.api.SyncJson
import com.refactor.app.api.dto.RegeneratePlanOptions
import com.refactor.app.api.dto.SyncGetResponse
import com.refactor.app.api.dto.UserProfileDto
import com.refactor.app.db.SyncCacheDao
import com.refactor.app.widget.RecompWidgetUpdater
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

sealed interface DashboardUiState {
    data object Loading : DashboardUiState
    data class Ready(
        val profile: UserProfileDto,
        val xp: Int,
        val hasAdjusted: Boolean?,
    ) : DashboardUiState

    data class Error(val message: String) : DashboardUiState
}

data class UploadFeedback(val message: String, val isError: Boolean)

class DashboardViewModel(
    private val syncRepository: SyncRepository,
    private val syncCacheDao: SyncCacheDao,
    private val appContext: Context,
) : ViewModel() {

    private val _state = MutableStateFlow<DashboardUiState>(DashboardUiState.Loading)
    val state: StateFlow<DashboardUiState> = _state.asStateFlow()

    /** Latest decoded GET snapshot (for dashboard widgets mirroring iOS). */
    val snapshot: StateFlow<SyncGetResponse?> =
        syncCacheDao.observe()
            .map { entity ->
                val raw = entity?.payloadJson ?: return@map null
                runCatching { SyncJson.format.decodeFromString<SyncGetResponse>(raw) }.getOrNull()
            }
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    /** True when Room holds a GET snapshot (upload POST can echo it). */
    val hasCachedSnapshot: StateFlow<Boolean> =
        syncCacheDao.observe()
            .map { it != null }
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), false)

    private val _uploading = MutableStateFlow(false)
    val uploading: StateFlow<Boolean> = _uploading.asStateFlow()

    private val _uploadFeedback = MutableStateFlow<UploadFeedback?>(null)
    val uploadFeedback: StateFlow<UploadFeedback?> = _uploadFeedback.asStateFlow()

    private val _applyingTdeeTargets = MutableStateFlow(false)
    val applyingTdeeTargets: StateFlow<Boolean> = _applyingTdeeTargets.asStateFlow()

    private val _regeneratingPlan = MutableStateFlow(false)
    val regeneratingPlan: StateFlow<Boolean> = _regeneratingPlan.asStateFlow()

    private val _checkInMessage = MutableStateFlow<String?>(null)
    val checkInMessage: StateFlow<String?> = _checkInMessage.asStateFlow()

    private val _checkInLoading = MutableStateFlow(false)
    val checkInLoading: StateFlow<Boolean> = _checkInLoading.asStateFlow()

    fun dismissUploadFeedback() {
        _uploadFeedback.value = null
    }

    fun addHydration(ml: Int) {
        viewModelScope.launch { syncRepository.addHydrationEntry(ml.toDouble()) }
    }

    fun removeHydration(ml: Int) {
        viewModelScope.launch { syncRepository.removeLatestHydration(ml.toDouble()) }
    }

    fun startFast() {
        viewModelScope.launch { syncRepository.startFast() }
    }

    fun endFast() {
        viewModelScope.launch { syncRepository.endActiveFast() }
    }

    fun logBiofeedback(energy: Int, mood: Int, hunger: Int, stress: Int, soreness: Int) {
        viewModelScope.launch {
            syncRepository.logBiofeedback(energy, mood, hunger, stress, soreness)
        }
    }

    /** Recalculates macro targets from the adaptive-TDEE estimate and saves them into the plan. */
    fun applyTdeeToTargets(estimatedTdee: Int) {
        viewModelScope.launch {
            if (_applyingTdeeTargets.value) return@launch
            _applyingTdeeTargets.value = true
            syncRepository.applyTdeeToMacroTargets(estimatedTdee).fold(
                onSuccess = { macros ->
                    _uploadFeedback.value = UploadFeedback(
                        "Macro targets updated to ${macros.calories.roundToInt()} kcal/day",
                        isError = false,
                    )
                },
                onFailure = { e ->
                    _uploadFeedback.value = UploadFeedback(
                        message = when (e) {
                            is ApiException -> e.message ?: "Could not update targets"
                            else -> e.message ?: "Could not update targets"
                        },
                        isError = true,
                    )
                },
            )
            _applyingTdeeTargets.value = false
        }
    }

    fun regeneratePlan(options: RegeneratePlanOptions = RegeneratePlanOptions()) {
        viewModelScope.launch {
            if (_regeneratingPlan.value) return@launch
            _regeneratingPlan.value = true
            syncRepository.regeneratePlan(options).fold(
                onSuccess = {
                    val weeks = options.programWeeks ?: 1
                    _uploadFeedback.value = UploadFeedback(
                        if (weeks > 1) "Your $weeks-week program has been regenerated."
                        else "Your workout plan has been regenerated.",
                        isError = false,
                    )
                },
                onFailure = { e ->
                    _uploadFeedback.value = UploadFeedback(
                        message = when (e) {
                            is ApiException -> e.message ?: "Could not regenerate plan"
                            else -> e.message ?: "Could not regenerate plan"
                        },
                        isError = true,
                    )
                },
            )
            _regeneratingPlan.value = false
        }
    }

    fun fetchCheckIn() {
        viewModelScope.launch {
            if (_checkInLoading.value) return@launch
            _checkInLoading.value = true
            syncRepository.coachCheckIn().fold(
                onSuccess = { _checkInMessage.value = it.message ?: "Keep pushing — consistency wins." },
                onFailure = { _checkInMessage.value = "Keep pushing! You've got this." },
            )
            _checkInLoading.value = false
        }
    }

    init {
        syncCacheDao.observe()
            .onEach { entity ->
                val raw = entity?.payloadJson ?: return@onEach
                runCatching {
                    applySnapshot(SyncJson.format.decodeFromString<SyncGetResponse>(raw))
                }
            }
            .launchIn(viewModelScope)

        viewModelScope.launch {
            if (_state.value !is DashboardUiState.Ready) {
                _state.value = DashboardUiState.Loading
            }
            syncRepository.fetchSnapshot().fold(
                onSuccess = { applySnapshot(it) },
                onFailure = { e ->
                    if (_state.value is DashboardUiState.Ready) return@fold
                    val msg = when (e) {
                        is ApiException -> e.message
                        else -> e.message ?: "Sync failed"
                    }
                    _state.value = DashboardUiState.Error(msg)
                }
            )
        }
    }

    fun uploadCachedSnapshot() {
        viewModelScope.launch {
            if (_uploading.value) return@launch
            _uploadFeedback.value = null
            _uploading.value = true
            syncRepository.pushCachedSnapshot().fold(
                onSuccess = { _uploadFeedback.value = UploadFeedback("Synced to server", isError = false) },
                onFailure = { e ->
                    _uploadFeedback.value = UploadFeedback(
                        message = when (e) {
                            is ApiException -> e.message ?: "Upload failed"
                            else -> e.message ?: "Upload failed"
                        },
                        isError = true,
                    )
                },
            )
            _uploading.value = false
        }
    }

    fun refresh() {
        viewModelScope.launch {
            _state.value = DashboardUiState.Loading
            syncRepository.fetchSnapshot().fold(
                onSuccess = { applySnapshot(it) },
                onFailure = { e ->
                    val msg = when (e) {
                        is ApiException -> e.message
                        else -> e.message ?: "Sync failed"
                    }
                    _state.value = DashboardUiState.Error(msg)
                }
            )
        }
    }

    private fun applySnapshot(snap: SyncGetResponse) {
        val meta = snap.meta
        _state.value = DashboardUiState.Ready(
            profile = snap.profile,
            xp = meta?.xp ?: 0,
            hasAdjusted = meta?.hasAdjusted,
        )
        RecompWidgetUpdater.updateFromSnapshot(appContext, snap)
    }

    class Factory(
        private val syncRepository: SyncRepository,
        private val syncCacheDao: SyncCacheDao,
        private val appContext: Context,
    ) : ViewModelProvider.Factory {
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            require(modelClass.isAssignableFrom(DashboardViewModel::class.java))
            @Suppress("UNCHECKED_CAST")
            return DashboardViewModel(syncRepository, syncCacheDao, appContext) as T
        }
    }
}
