package com.refactor.app.ui.workouts

import android.app.Application
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.refactor.app.api.SyncJson
import com.refactor.app.api.SyncRepository
import com.refactor.app.api.WorkoutSetLogs
import com.refactor.app.api.dto.FitnessPlanDto
import com.refactor.app.api.dto.SyncGetResponse
import com.refactor.app.api.dto.WorkoutDayDto
import com.refactor.app.api.dto.WorkoutExerciseDto
import com.refactor.app.api.dto.WorkoutPlanSectionDto
import com.refactor.app.db.SyncCacheDao
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

class WorkoutsViewModel(
    application: Application,
    private val syncCacheDao: SyncCacheDao,
    private val syncRepository: SyncRepository,
) : ViewModel() {

    private val progressStore = WorkoutSetProgressStore(application)
    private val toggleMutex = Mutex()

    val workoutDays = syncCacheDao.observe()
        .map { entity ->
            val raw = entity?.payloadJson ?: return@map emptyList()
            runCatching {
                SyncJson.format.decodeFromString<SyncGetResponse>(raw)
                    .plan?.workoutPlan?.weeklyPlan.orEmpty()
            }.getOrElse { emptyList() }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val workoutProgressMap = syncCacheDao.observe()
        .map { entity ->
            val raw = entity?.payloadJson ?: return@map emptyMap<String, String>()
            runCatching {
                SyncJson.format.decodeFromString<SyncGetResponse>(raw).workoutProgress.orEmpty()
            }.getOrElse { emptyMap() }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyMap())

    val workoutProgressEntries = syncCacheDao.observe()
        .map { entity ->
            val raw = entity?.payloadJson ?: return@map emptyList<Pair<String, String>>()
            runCatching {
                SyncJson.format.decodeFromString<SyncGetResponse>(raw)
                    .workoutProgress.orEmpty()
                    .toList()
                    .sortedBy { it.first }
            }.getOrElse { emptyList() }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    private val _plan = MutableStateFlow<FitnessPlanDto?>(null)
    val plan: StateFlow<FitnessPlanDto?> = _plan.asStateFlow()

    private val _progressUiEpoch = MutableStateFlow(0L)
    val progressUiEpoch: StateFlow<Long> = _progressUiEpoch.asStateFlow()

    init {
        progressStore.load()
        _progressUiEpoch.value++
        syncCacheDao.observe()
            .map { entity ->
                val raw = entity?.payloadJson ?: return@map null
                runCatching { SyncJson.format.decodeFromString<SyncGetResponse>(raw) }.getOrNull()
            }
            .distinctUntilChanged { a, b ->
                a?.workoutProgress == b?.workoutProgress && a?.plan == b?.plan
            }
            .onEach { snap ->
                if (snap == null) {
                    _plan.value = null
                    return@onEach
                }
                _plan.value = snap.plan
                progressStore.replaceFromServer(snap.plan, snap.workoutProgress.orEmpty())
                _progressUiEpoch.value++
            }
            .launchIn(viewModelScope)
    }

    fun isSetComplete(
        planId: String,
        progressDayKey: String,
        dayLabel: String,
        section: String,
        exercise: WorkoutExerciseDto,
        globalSlot: Int,
        setIndex: Int,
    ): Boolean {
        val rowKey = WorkoutWebProgress.localRowSetProgressKey(planId, dayLabel, section, exercise, globalSlot)
        return progressStore.rowSetTags(progressDayKey, rowKey).contains("set_$setIndex")
    }

    suspend fun toggleSetAndSync(
        planId: String,
        progressDayKey: String,
        day: WorkoutDayDto,
        globalSlot: Int,
        exercise: WorkoutExerciseDto,
        setIndex: Int,
    ): Result<Boolean> = toggleMutex.withLock {
        if (planId.isBlank()) return@withLock Result.failure(IllegalStateException("No plan id"))
        val section = day.sectionForGlobalSlot(globalSlot)
        val rowKey = WorkoutWebProgress.localRowSetProgressKey(planId, day.day, section, exercise, globalSlot)
        val wasComplete = progressStore.rowSetTags(progressDayKey, rowKey).contains("set_$setIndex")
        progressStore.toggleSetTag(planId, progressDayKey, day.day, section, exercise, globalSlot, setIndex)
        _progressUiEpoch.value++
        val markedComplete = !wasComplete

        val entity = syncCacheDao.getOnce() ?: return@withLock Result.failure(IllegalStateException("No cached snapshot"))
        val snap = runCatching { SyncJson.format.decodeFromString<SyncGetResponse>(entity.payloadJson) }.getOrNull()
            ?: return@withLock Result.failure(IllegalStateException("Bad snapshot"))
        val merged = progressStore.mergedForPush(snap.plan)
        val prev = snap.workoutProgress.orEmpty()

        val logId = WorkoutSetLogs.logId(planId, progressDayKey, day.day, section, exercise.name, globalSlot, setIndex)
        val nextLogs = if (markedComplete) {
            WorkoutSetLogs.upsert(
                snap.workoutSetLogs.orEmpty(),
                WorkoutSetLogs.buildLog(planId, progressDayKey, day.day, section, exercise, globalSlot, setIndex),
            )
        } else {
            WorkoutSetLogs.remove(snap.workoutSetLogs.orEmpty(), logId)
        }
        val logsChanged = nextLogs != snap.workoutSetLogs.orEmpty()
        if (merged == prev && !logsChanged) return@withLock Result.success(markedComplete)

        val local = syncRepository.mutateCachedSnapshot {
            it.copy(workoutProgress = merged, workoutSetLogs = nextLogs)
        }
        if (local.isFailure) {
            return@withLock Result.failure(local.exceptionOrNull() ?: IllegalStateException("Snapshot mutate failed"))
        }
        syncRepository.pushCachedSnapshot().map { markedComplete }
    }

    suspend fun persistWeeklyPlanAndPush(days: List<WorkoutDayDto>): Result<Unit> =
        persistWorkoutPlanAndPush(days, replaceProgramAnchor = false)

    suspend fun replaceWorkoutProgramAndPush(days: List<WorkoutDayDto>): Result<Unit> =
        persistWorkoutPlanAndPush(days, replaceProgramAnchor = true)

    private suspend fun persistWorkoutPlanAndPush(
        days: List<WorkoutDayDto>,
        replaceProgramAnchor: Boolean,
    ): Result<Unit> {
        val local = syncRepository.mutateCachedSnapshot { snap ->
            val plan = snap.plan ?: return@mutateCachedSnapshot snap
            val wp = plan.workoutPlan ?: WorkoutPlanSectionDto()
            val newWp = if (replaceProgramAnchor) {
                wp.copy(
                    weeklyPlan = days,
                    programWeek1Start = WorkoutImportStart.inferProgramWeek1Start(days),
                    programWeekOffset = 0,
                    missedSessions = emptyList(),
                    catchUpBannerDismissedAt = null,
                )
            } else {
                wp.copy(weeklyPlan = days)
            }
            val newPlan = plan.copy(workoutPlan = newWp)
            snap.copy(plan = newPlan)
        }
        if (local.isFailure) return Result.failure(local.exceptionOrNull()!!)
        return syncRepository.pushCachedSnapshot()
    }

    suspend fun applyScheduleAction(action: ScheduleAction): Result<String> {
        val progress = mergedWorkoutProgress(_plan.value)
        var summary = ""
        val local = syncRepository.mutateCachedSnapshot { snap ->
            val plan = snap.plan ?: return@mutateCachedSnapshot snap
            val (updated, actionSummary) = WorkoutScheduleService.applyScheduleAction(plan, action, progress)
            summary = actionSummary
            snap.copy(plan = updated)
        }
        if (local.isFailure) return Result.failure(local.exceptionOrNull()!!)
        return syncRepository.pushCachedSnapshot().map { summary }
    }

    suspend fun dismissCatchUpBanner(): Result<Unit> {
        val local = syncRepository.mutateCachedSnapshot { snap ->
            val plan = snap.plan ?: return@mutateCachedSnapshot snap
            snap.copy(plan = WorkoutScheduleService.dismissCatchUpBanner(plan))
        }
        if (local.isFailure) return Result.failure(local.exceptionOrNull()!!)
        return syncRepository.pushCachedSnapshot()
    }

    suspend fun askCoachForSchedule(): Result<String> =
        syncRepository.adjustWorkoutSchedule(useAiRecommendation = true).map { it.summary }

    fun mergedWorkoutProgress(plan: FitnessPlanDto?): Map<String, String> =
        progressStore.mergedForPush(plan)

    class Factory(
        private val application: Application,
        private val dao: SyncCacheDao,
        private val syncRepository: SyncRepository,
    ) : ViewModelProvider.Factory {
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            require(modelClass.isAssignableFrom(WorkoutsViewModel::class.java))
            @Suppress("UNCHECKED_CAST")
            return WorkoutsViewModel(application, dao, syncRepository) as T
        }
    }
}
