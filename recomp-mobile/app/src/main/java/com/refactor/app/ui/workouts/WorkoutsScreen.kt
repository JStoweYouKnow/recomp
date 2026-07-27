package com.refactor.app.ui.workouts

import android.app.Application
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import android.content.Intent
import android.net.Uri
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.ImageLoader
import coil.compose.AsyncImage
import coil.decode.GifDecoder
import coil.decode.ImageDecoderDecoder
import coil.request.ImageRequest
import com.refactor.app.BuildConfig
import com.refactor.app.api.SyncJson
import com.refactor.app.api.SyncRepository
import com.refactor.app.api.WorkoutExtrasRepository
import com.refactor.app.api.dto.PlaylistSuggestionDto
import com.refactor.app.api.dto.RecoveryAssessmentDto
import com.refactor.app.api.dto.SyncGetResponse
import com.refactor.app.api.dto.ParseWorkoutUrlResponseDto
import com.refactor.app.api.dto.WorkoutDayDto
import com.refactor.app.api.dto.WorkoutExerciseDto
import com.refactor.app.db.SyncCacheDao
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.nio.ByteBuffer
import java.time.LocalDate

// ─── Screen ──────────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WorkoutsScreen(
    syncRepository: SyncRepository,
    syncCacheDao: SyncCacheDao,
    workoutExtrasRepository: WorkoutExtrasRepository,
) {
    val context = LocalContext.current
    val vm: WorkoutsViewModel = viewModel(
        factory = WorkoutsViewModel.Factory(
            context.applicationContext as Application,
            syncCacheDao,
            syncRepository,
        ),
    )

    val days by vm.workoutDays.collectAsStateWithLifecycle()
    val plan by vm.plan.collectAsStateWithLifecycle()
    val progressMap by vm.workoutProgressMap.collectAsStateWithLifecycle()
    val planId = plan?.id.orEmpty()
    val progressUiEpoch by vm.progressUiEpoch.collectAsStateWithLifecycle()
    val catchUpProgress = remember(plan, progressMap, progressUiEpoch) {
        vm.mergedWorkoutProgress(plan)
    }

    val cacheEntity by syncCacheDao.observe().collectAsStateWithLifecycle(initialValue = null)
    val todaysBiofeedback = remember(cacheEntity) {
        cacheEntity?.payloadJson?.let { raw ->
            runCatching {
                val snap = SyncJson.format.decodeFromString<SyncGetResponse>(raw)
                val today = LocalDate.now().toString()
                snap.biofeedback?.filter { it.date == today }?.maxByOrNull { it.time }
            }.getOrNull()
        }
    }

    var selectedDate by rememberSaveable { mutableStateOf(LocalDate.now()) }
    var recoveryAssessment by remember { mutableStateOf<RecoveryAssessmentDto?>(null) }
    var isLoadingRecovery by remember { mutableStateOf(false) }
    var recoveryError by remember { mutableStateOf<String?>(null) }
    var editIndex by remember { mutableStateOf<Int?>(null) }
    var showImportSheet by remember { mutableStateOf(false) }
    var showMenu by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var restTimer by remember { mutableStateOf<RestTimerState?>(null) }
    var workoutSummary by remember { mutableStateOf<WorkoutSummaryData?>(null) }
    val scope = rememberCoroutineScope()

    val sessionClock = remember { WorkoutSessionClock(context) }
    val prStore = remember { PersonalRecordStore(context) }
    val weightLogStore = remember { WorkoutWeightLogStore(context) }

    val selectedPlanIndex = remember(days, selectedDate, plan) {
        plan?.let { WorkoutProgramSchedule.planIndexForDate(it, selectedDate) }
    }
    val selectedDay = selectedPlanIndex?.let { days.getOrNull(it) }

    Column(Modifier.fillMaxWidth()) {
        TopAppBar(
            title = { Text("Workouts", style = MaterialTheme.typography.titleLarge) },
            actions = {
                Box {
                    IconButton(onClick = { showMenu = true }) {
                        Icon(Icons.Filled.MoreVert, contentDescription = "Options")
                    }
                    DropdownMenu(expanded = showMenu, onDismissRequest = { showMenu = false }) {
                        if (planId.isNotBlank()) {
                            DropdownMenuItem(
                                text = { Text("Import workout") },
                                leadingIcon = { Icon(Icons.Filled.Link, contentDescription = null) },
                                onClick = { showMenu = false; showImportSheet = true },
                            )
                        }
                        DropdownMenuItem(
                            text = { Text("Reset today's progress") },
                            leadingIcon = { Icon(Icons.Filled.Refresh, contentDescription = null) },
                            onClick = {
                                showMenu = false
                                scope.launch {
                                    vm.persistWeeklyPlanAndPush(days)
                                }
                            },
                        )
                    }
                }
            },
        )

        CalendarStrip(
            selectedDate = selectedDate,
            onDateSelected = { selectedDate = it },
            onPreviousWeek = { selectedDate = selectedDate.minusWeeks(1) },
            onNextWeek = { selectedDate = selectedDate.plusWeeks(1) },
            modifier = Modifier.padding(horizontal = 8.dp),
        )

        HorizontalDivider()

        Box(Modifier.weight(1f, fill = false)) {
        Column(
            Modifier
                .verticalScroll(rememberScrollState())
                .padding(bottom = if (restTimer != null) 112.dp else 16.dp),
        ) {
            Spacer(Modifier.height(12.dp))

            plan?.let { currentPlan ->
                CatchUpBanner(
                    plan = currentPlan,
                    progress = catchUpProgress,
                    onApplyAction = { action ->
                        vm.applyScheduleAction(action).getOrNull()
                    },
                    onDismiss = {
                        vm.dismissCatchUpBanner()
                    },
                    onAskCoach = {
                        vm.askCoachForSchedule().getOrNull()
                    },
                )
                CatchUpQueue(
                    plan = currentPlan,
                    onOpenDate = { dateStr ->
                        runCatching { LocalDate.parse(dateStr) }.getOrNull()?.let { selectedDate = it }
                    },
                )
            }

            // Recovery section
            todaysBiofeedback?.let { bf ->
                RecoverySection(
                    assessment = recoveryAssessment,
                    isLoading = isLoadingRecovery,
                    error = recoveryError,
                    onAssess = {
                        isLoadingRecovery = true
                        recoveryError = null
                        recoveryAssessment = null
                        scope.launch {
                            workoutExtrasRepository.recoveryAdjust(bf).fold(
                                onSuccess = { recoveryAssessment = it },
                                onFailure = { recoveryError = it.message ?: "Recovery failed" },
                            )
                            isLoadingRecovery = false
                        }
                    },
                    onDismiss = { recoveryAssessment = null },
                )
                Spacer(Modifier.height(8.dp))
            }

            if (busy) {
                Row(
                    Modifier.padding(horizontal = 20.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(16.dp))
                    Text("Saving…", style = MaterialTheme.typography.bodySmall)
                }
            }

            when {
                days.isEmpty() -> EmptyWorkoutState()
                selectedDay == null -> NoWorkoutForDay(selectedDate)
                else -> {
                    key(progressUiEpoch, selectedPlanIndex) {
                        WorkoutDayCard(
                            planId = planId,
                            day = selectedDay,
                            isToday = selectedDate == LocalDate.now(),
                            recoveryVolumeModifier = recoveryAssessment?.modifiedWorkout?.volumeAdjustment,
                            setProgressEnabled = planId.isNotBlank(),
                            isSetComplete = { ex, globalSlot, setIdx ->
                                vm.isSetComplete(
                                    planId = planId,
                                    progressDayKey = WorkoutProgramSchedule.progressDayKeyForWorkoutDay(
                                        selectedDay.day, selectedDate,
                                    ),
                                    dayLabel = selectedDay.day,
                                    section = selectedDay.sectionForGlobalSlot(globalSlot),
                                    exercise = ex,
                                    globalSlot = globalSlot,
                                    setIndex = setIdx,
                                )
                            },
                            onToggleSet = { ex, globalSlot, setIdx ->
                                val day = selectedDay ?: return@WorkoutDayCard
                                if (planId.isNotBlank()) {
                                    val progressDayKey = WorkoutProgramSchedule.progressDayKeyForWorkoutDay(
                                        day.day, selectedDate,
                                    )
                                    busy = true
                                    scope.launch {
                                        vm.toggleSetAndSync(
                                            planId, progressDayKey, day, globalSlot, ex, setIdx,
                                        ).fold(
                                            onSuccess = { markedComplete ->
                                                busy = false
                                                if (markedComplete && setIdx < ex.effectiveSetCount() - 1) {
                                                    val seconds = ex.restSeconds()
                                                    restTimer = RestTimerState(
                                                        exerciseName = ex.name,
                                                        endEpochMs = System.currentTimeMillis() + seconds * 1000L,
                                                        totalSeconds = seconds,
                                                    )
                                                } else if (!markedComplete) {
                                                    restTimer = null
                                                }
                                            },
                                            onFailure = { busy = false },
                                        )
                                    }
                                }
                            },
                            onSetCompleted = { ex, setIdx, weight, reps ->
                                val day = selectedDay ?: return@WorkoutDayCard
                                if (planId.isNotBlank()) {
                                    val progressDayKey = WorkoutProgramSchedule.progressDayKeyForWorkoutDay(
                                        day.day, selectedDate,
                                    )
                                    sessionClock.markStartedIfNeeded(progressDayKey)
                                    if (weight != null && weight > 0 && reps != null && reps > 0) {
                                        weightLogStore.record(planId, progressDayKey, ex.name, setIdx, weight, reps)
                                        if (prStore.record(ex.name, weight, reps)) {
                                            Feedback.celebrate(context, "New PR: ${ex.name}! 🏆")
                                        }
                                    }
                                }
                            },
                            onCompleted = {
                                val day = selectedDay ?: return@WorkoutDayCard
                                if (planId.isBlank()) return@WorkoutDayCard
                                val progressDayKey = WorkoutProgramSchedule.progressDayKeyForWorkoutDay(
                                    day.day, selectedDate,
                                )
                                Feedback.success(context)
                                val startMs = sessionClock.startMillis(progressDayKey)
                                val logs = weightLogStore.logsForDay(planId, progressDayKey)
                                workoutSummary = WorkoutSummaryData(
                                    dayLabel = day.day,
                                    focus = day.focus,
                                    exercisesCompleted = day.enumeratedExerciseSlots().count { (slot, ex) ->
                                        (0 until ex.effectiveSetCount()).all { s ->
                                            vm.isSetComplete(
                                                planId, progressDayKey, day.day,
                                                day.sectionForGlobalSlot(slot), ex, slot, s,
                                            )
                                        }
                                    },
                                    totalExercises = day.enumeratedExerciseSlots().size,
                                    setsLogged = logs.size,
                                    totalVolumeLbs = logs.sumOf { it.weightLbs * it.reps },
                                    durationMs = startMs?.let { System.currentTimeMillis() - it },
                                )
                                if (startMs != null) {
                                    scope.launch {
                                        HealthConnectWriter.saveWorkout(context, day.focus, startMs, System.currentTimeMillis())
                                    }
                                }
                                sessionClock.clear(progressDayKey)
                            },
                            workoutExtrasRepository = workoutExtrasRepository,
                            onEdit = {
                                selectedPlanIndex?.let { editIndex = it }
                            },
                        )
                    }
                }
            }
        }

            restTimer?.let { timer ->
                RestTimerBanner(
                    state = timer,
                    onSkip = { restTimer = null },
                    onAdd15 = { restTimer = timer.extend(15) },
                    onFinished = { restTimer = null },
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                )
            }
        }
    }

    // Edit dialog — preserves existing EditWorkoutDayDialog unchanged
    editIndex?.let { i ->
        val day = days.getOrNull(i) ?: return@let
        EditWorkoutDayDialog(
            day = day,
            onDismiss = { editIndex = null },
            onSave = { newDay ->
                busy = true
                scope.launch {
                    val newList = days.toMutableList().also { list -> list[i] = newDay }
                    vm.persistWeeklyPlanAndPush(newList).fold(
                        onSuccess = { busy = false; editIndex = null },
                        onFailure = { busy = false },
                    )
                }
            },
        )
    }

    if (showImportSheet) {
        WorkoutImportDialog(
            workoutExtrasRepository = workoutExtrasRepository,
            onDismiss = { showImportSheet = false },
            onImport = { importedDay ->
                showImportSheet = false
                busy = true
                scope.launch {
                    val newList = days + importedDay
                    vm.persistWeeklyPlanAndPush(newList).fold(
                        onSuccess = { busy = false },
                        onFailure = { busy = false },
                    )
                }
            },
            onReplaceProgram = { programDays ->
                showImportSheet = false
                busy = true
                scope.launch {
                    vm.replaceWorkoutProgramAndPush(programDays).fold(
                        onSuccess = { busy = false },
                        onFailure = { busy = false },
                    )
                }
            },
        )
    }

    workoutSummary?.let { summary ->
        WorkoutSummaryDialog(summary = summary, onDismiss = { workoutSummary = null })
    }
}

// ─── Day Card ────────────────────────────────────────────────────────────────

@Composable
private fun WorkoutDayCard(
    planId: String,
    day: WorkoutDayDto,
    isToday: Boolean,
    recoveryVolumeModifier: Double?,
    setProgressEnabled: Boolean,
    isSetComplete: (WorkoutExerciseDto, Int, Int) -> Boolean,
    onToggleSet: (WorkoutExerciseDto, Int, Int) -> Unit,
    onSetCompleted: (WorkoutExerciseDto, Int, Double?, Int?) -> Unit,
    onCompleted: () -> Unit,
    workoutExtrasRepository: WorkoutExtrasRepository,
    onEdit: () -> Unit,
) {
    val totalExercises = day.enumeratedExerciseSlots().size
    val completedExercises = day.enumeratedExerciseSlots().count { (slot, ex) ->
        (0 until ex.effectiveSetCount()).all { setIdx ->
            isSetComplete(ex, slot, setIdx)
        }
    }

    // Fire the summary/celebration exactly when the day tips from incomplete → complete.
    // Seeded with the current value so re-opening an already-done day stays quiet.
    val allDone = totalExercises > 0 && completedExercises == totalExercises
    var prevAllDone by rememberSaveable(day.day) { mutableStateOf(allDone) }
    LaunchedEffect(allDone) {
        if (allDone && !prevAllDone) onCompleted()
        prevAllDone = allDone
    }

    var isExpanded by rememberSaveable { mutableStateOf(isToday) }
    var musicSuggestions by remember { mutableStateOf<List<PlaylistSuggestionDto>>(emptyList()) }
    var isLoadingMusic by remember { mutableStateOf(false) }
    var showMusic by remember { mutableStateOf(false) }
    var musicError by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        shape = RoundedCornerShape(16.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
    ) {
        // Header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp)),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            OutlinedButton(
                onClick = { isExpanded = !isExpanded },
                modifier = Modifier.weight(1f).padding(start = 12.dp, top = 8.dp, bottom = 8.dp),
                shape = RoundedCornerShape(12.dp),
                border = null,
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (isToday) {
                        Box(
                            Modifier
                                .size(8.dp)
                                .clip(RoundedCornerShape(50))
                                .background(MaterialTheme.colorScheme.primary)
                        )
                        Spacer(Modifier.width(8.dp))
                    }
                    Column(Modifier.weight(1f)) {
                        Text(
                            day.day,
                            style = MaterialTheme.typography.titleSmall,
                            color = if (isToday) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            day.focus,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    if (totalExercises > 0) {
                        val allDone = completedExercises == totalExercises
                        val pillColor = if (allDone) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline
                        Surface(
                            shape = RoundedCornerShape(50),
                            color = pillColor.copy(alpha = 0.12f),
                        ) {
                            Text(
                                "$completedExercises/$totalExercises done",
                                style = MaterialTheme.typography.labelSmall,
                                color = pillColor,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                            )
                        }
                    }
                    Spacer(Modifier.width(4.dp))
                    Icon(
                        if (isExpanded) Icons.Filled.KeyboardArrowUp else Icons.Filled.KeyboardArrowDown,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(20.dp),
                    )
                }
            }

            IconButton(onClick = onEdit) {
                Icon(
                    Icons.Filled.Edit,
                    contentDescription = "Edit workout",
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(20.dp),
                )
            }
        }

        AnimatedVisibility(
            visible = isExpanded,
            enter = expandVertically(),
            exit = shrinkVertically(),
        ) {
            Column {
                HorizontalDivider()

                // Warmup section
                day.warmups?.takeIf { it.isNotEmpty() }?.let { warmups ->
                    ExerciseSection(
                        title = "Warm-up",
                        color = Color(0xFFF59E0B),
                        exercises = warmups,
                        baseGlobalSlot = 0,
                        planId = planId,
                        day = day,
                        isSetComplete = isSetComplete,
                        onToggleSet = onToggleSet,
                        onSetCompleted = onSetCompleted,
                        setProgressEnabled = setProgressEnabled,
                        workoutExtrasRepository = workoutExtrasRepository,
                    )
                }

                // Main section
                ExerciseSection(
                    title = "Main",
                    color = MaterialTheme.colorScheme.primary,
                    exercises = day.exercises,
                    baseGlobalSlot = day.warmups?.size ?: 0,
                    planId = planId,
                    day = day,
                    isSetComplete = isSetComplete,
                    onToggleSet = onToggleSet,
                    onSetCompleted = onSetCompleted,
                    setProgressEnabled = setProgressEnabled,
                    workoutExtrasRepository = workoutExtrasRepository,
                )

                // Finisher section
                day.finishers?.takeIf { it.isNotEmpty() }?.let { finishers ->
                    ExerciseSection(
                        title = "Finisher",
                        color = Color(0xFF64748B),
                        exercises = finishers,
                        baseGlobalSlot = (day.warmups?.size ?: 0) + day.exercises.size,
                        planId = planId,
                        day = day,
                        isSetComplete = isSetComplete,
                        onToggleSet = onToggleSet,
                        onSetCompleted = onSetCompleted,
                        setProgressEnabled = setProgressEnabled,
                        workoutExtrasRepository = workoutExtrasRepository,
                    )
                }

                // Recovery volume note
                recoveryVolumeModifier?.takeIf { it != 1.0 }?.let { mod ->
                    val pct = ((mod - 1.0) * 100).toInt()
                    Row(
                        Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("⚠", style = MaterialTheme.typography.bodySmall)
                        Text(
                            "Recovery suggests ${if (pct >= 0) "+$pct%" else "$pct%"} volume today",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                // Music section
                Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
                    OutlinedButton(
                        onClick = {
                            if (showMusic) {
                                showMusic = false
                            } else {
                                isLoadingMusic = true
                                musicError = null
                                scope.launch {
                                    workoutExtrasRepository.musicSuggest(day.focus).fold(
                                        onSuccess = { resp ->
                                            musicSuggestions = resp.suggestions
                                            showMusic = true
                                        },
                                        onFailure = { musicError = it.message },
                                    )
                                    isLoadingMusic = false
                                }
                            }
                        },
                        enabled = !isLoadingMusic,
                        modifier = Modifier.height(36.dp),
                    ) {
                        if (isLoadingMusic) {
                            CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(14.dp))
                            Spacer(Modifier.width(6.dp))
                        } else {
                            Icon(Icons.Filled.MusicNote, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(6.dp))
                        }
                        Text(
                            if (showMusic) "Hide Playlists" else "Workout Music",
                            style = MaterialTheme.typography.labelMedium,
                        )
                    }

                    musicError?.let {
                        Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                    }

                    if (showMusic && musicSuggestions.isNotEmpty()) {
                        val context = LocalContext.current
                        Row(
                            Modifier
                                .horizontalScroll(rememberScrollState())
                                .padding(top = 8.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            musicSuggestions.forEach { suggestion ->
                                PlaylistPill(suggestion = suggestion, onClick = {
                                    runCatching {
                                        context.startActivity(
                                            Intent(Intent.ACTION_VIEW, Uri.parse(suggestion.deepLink))
                                                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                                        )
                                    }
                                })
                            }
                        }
                    }
                }
            }
        }
    }
}

// ─── Exercise Section ────────────────────────────────────────────────────────

@Composable
private fun ExerciseSection(
    title: String,
    color: Color,
    exercises: List<WorkoutExerciseDto>,
    baseGlobalSlot: Int,
    planId: String,
    day: WorkoutDayDto,
    isSetComplete: (WorkoutExerciseDto, Int, Int) -> Boolean,
    onToggleSet: (WorkoutExerciseDto, Int, Int) -> Unit,
    onSetCompleted: (WorkoutExerciseDto, Int, Double?, Int?) -> Unit,
    setProgressEnabled: Boolean,
    workoutExtrasRepository: WorkoutExtrasRepository,
) {
    Column {
        Text(
            title,
            style = MaterialTheme.typography.labelMedium,
            color = color,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(start = 16.dp, top = 12.dp, bottom = 4.dp),
        )
        exercises.forEachIndexed { j, exercise ->
            val globalSlot = baseGlobalSlot + j
            ExerciseRow(
                exercise = exercise,
                globalSlot = globalSlot,
                setProgressEnabled = setProgressEnabled,
                isSetComplete = { setIdx -> isSetComplete(exercise, globalSlot, setIdx) },
                onToggleSet = { setIdx -> onToggleSet(exercise, globalSlot, setIdx) },
                onSetCompleted = { setIdx, weight, reps -> onSetCompleted(exercise, setIdx, weight, reps) },
                workoutExtrasRepository = workoutExtrasRepository,
            )
            if (j < exercises.lastIndex) {
                HorizontalDivider(Modifier.padding(start = 16.dp))
            }
        }
    }
}

// ─── Exercise Row ────────────────────────────────────────────────────────────

@Composable
private fun ExerciseRow(
    exercise: WorkoutExerciseDto,
    globalSlot: Int,
    setProgressEnabled: Boolean,
    isSetComplete: (Int) -> Boolean,
    onToggleSet: (Int) -> Unit,
    onSetCompleted: (Int, Double?, Int?) -> Unit,
    workoutExtrasRepository: WorkoutExtrasRepository,
) {
    val context = LocalContext.current
    val numSets = exercise.effectiveSetCount()
    var gifBytes by remember(globalSlot, exercise.name) { mutableStateOf<ByteArray?>(null) }
    var showGif by remember(globalSlot, exercise.name) { mutableStateOf(false) }
    var weightText by rememberSaveable(exercise.name) { mutableStateOf("") }

    // Prefetch the demo so the play button only appears when a real demo exists.
    LaunchedEffect(globalSlot, exercise.name) {
        if (gifBytes == null) {
            gifBytes = workoutExtrasRepository.fetchExerciseGif(exercise.name).getOrNull()
        }
    }

    // Prefill the weight field with the last weight used for this lift (progressive overload).
    val weightLogStore = remember { WorkoutWeightLogStore(context) }
    LaunchedEffect(exercise.name) {
        if (weightText.isBlank()) {
            weightLogStore.lastWeight(exercise.name)?.let { last ->
                weightText = if (last % 1.0 == 0.0) last.toInt().toString() else last.toString()
            }
        }
    }

    Column(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 10.dp),
    ) {
        Row(
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Column(Modifier.weight(1f)) {
                Text(exercise.name, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                Text(
                    "${exercise.sets} × ${exercise.reps}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                exercise.restDisplayLabel()?.let { restLabel ->
                    Surface(
                        shape = RoundedCornerShape(50),
                        color = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = 0.5f),
                    ) {
                        Text(
                            "$restLabel rest",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSecondaryContainer,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                        )
                    }
                } ?: exercise.notes?.takeIf { it.isNotBlank() }?.let {
                    Text(
                        it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            // GIF play button — only rendered once a real demo has loaded, so
            // exercises without an available demo never show a play button.
            if (gifBytes != null) {
                IconButton(onClick = { showGif = !showGif }) {
                    Icon(
                        Icons.Filled.PlayArrow,
                        contentDescription = if (showGif) "Hide demo" else "Show demo",
                        tint = if (showGif) MaterialTheme.colorScheme.onSurfaceVariant
                        else MaterialTheme.colorScheme.primary,
                    )
                }
            }
        }

        // Working-weight input — feeds set logs, PR detection, and the post-workout summary.
        if (setProgressEnabled) {
            OutlinedTextField(
                value = weightText,
                onValueChange = { new -> weightText = new.filter { it.isDigit() || it == '.' } },
                label = { Text("Weight (lbs)") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                modifier = Modifier
                    .padding(top = 8.dp)
                    .width(140.dp),
            )
        }

        // Set buttons — animated rounded squares
        Row(
            Modifier
                .horizontalScroll(rememberScrollState())
                .padding(top = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            repeat(numSets) { setIdx ->
                val done = isSetComplete(setIdx)
                val bgColor by animateColorAsState(
                    targetValue = if (done) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
                    animationSpec = spring(),
                    label = "set_bg_$setIdx",
                )
                val contentColor by animateColorAsState(
                    targetValue = if (done) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                    label = "set_fg_$setIdx",
                )
                Box(
                    modifier = Modifier
                        .size(38.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(bgColor)
                        .then(
                            if (setProgressEnabled) Modifier.clickable {
                                val markingComplete = !done
                                onToggleSet(setIdx)
                                Feedback.tick(context)
                                if (markingComplete) {
                                    onSetCompleted(
                                        setIdx,
                                        weightText.toDoubleOrNull(),
                                        parsePrescribedReps(exercise.reps),
                                    )
                                }
                            }
                            else Modifier
                        ),
                    contentAlignment = Alignment.Center,
                ) {
                    if (done) {
                        Icon(
                            Icons.Filled.Check,
                            contentDescription = "Set ${setIdx + 1} complete",
                            tint = contentColor,
                            modifier = Modifier.size(18.dp),
                        )
                    } else {
                        Text(
                            "${setIdx + 1}",
                            style = MaterialTheme.typography.labelMedium,
                            color = contentColor,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
            }
        }

        // GIF image — decoded from the prefetched bytes with a GIF-capable
        // ImageLoader so demos animate instead of showing a static first frame.
        AnimatedVisibility(visible = showGif && gifBytes != null) {
            gifBytes?.let { bytes ->
                val context = LocalContext.current
                val gifLoader = remember {
                    ImageLoader.Builder(context)
                        .components {
                            if (Build.VERSION.SDK_INT >= 28) add(ImageDecoderDecoder.Factory())
                            else add(GifDecoder.Factory())
                        }
                        .build()
                }
                AsyncImage(
                    model = ImageRequest.Builder(context).data(ByteBuffer.wrap(bytes)).build(),
                    imageLoader = gifLoader,
                    contentDescription = "${exercise.name} demo",
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 8.dp)
                        .height(200.dp)
                        .clip(RoundedCornerShape(12.dp)),
                )
            }
        }
    }
}

// ─── Recovery Section ────────────────────────────────────────────────────────

@Composable
private fun RecoverySection(
    assessment: RecoveryAssessmentDto?,
    isLoading: Boolean,
    error: String?,
    onAssess: () -> Unit,
    onDismiss: () -> Unit,
) {
    if (assessment != null) {
        val levelColor = when (assessment.level.lowercase()) {
            "low" -> Color(0xFFEF4444)
            "moderate" -> Color(0xFFF59E0B)
            "high" -> Color(0xFF84CC16)
            "optimal" -> Color(0xFF22C55E)
            else -> Color(0xFF6B7280)
        }
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
        ) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "Recovery: ${assessment.level.replaceFirstChar { it.uppercaseChar() }}",
                        style = MaterialTheme.typography.titleSmall,
                        color = levelColor,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.weight(1f),
                    )
                    IconButton(onClick = onDismiss, modifier = Modifier.size(24.dp)) {
                        Text("✕", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }

                // Score bar
                val score = assessment.score.coerceIn(0.0, 1.0).toFloat()
                Box(
                    Modifier
                        .fillMaxWidth()
                        .height(8.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                ) {
                    Box(
                        Modifier
                            .fillMaxWidth(score)
                            .height(8.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(levelColor)
                    )
                }

                Text(
                    assessment.recommendation,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                assessment.modifiedWorkout?.let { mod ->
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        AdjustmentPill("Volume", mod.volumeAdjustment)
                        AdjustmentPill("Intensity", mod.intensityAdjustment)
                    }
                    mod.suggestedSwaps.takeIf { it.isNotEmpty() }?.forEach { swap ->
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                swap.original,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Text("→", style = MaterialTheme.typography.bodySmall)
                            Text(swap.replacement, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
        }
    } else {
        Column(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
        ) {
            OutlinedButton(
                onClick = onAssess,
                enabled = !isLoading,
                modifier = Modifier.fillMaxWidth(),
            ) {
                if (isLoading) {
                    CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Assessing recovery…")
                } else {
                    Text("Check Today's Recovery")
                }
            }
            error?.let {
                Text(
                    it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
        }
    }
}

@Composable
private fun AdjustmentPill(label: String, value: Double) {
    val pct = ((value - 1.0) * 100).toInt()
    val color = when {
        value < 1.0 -> Color(0xFFF59E0B)
        value > 1.0 -> Color(0xFF22C55E)
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }
    Surface(shape = RoundedCornerShape(50), color = color.copy(alpha = 0.1f)) {
        Text(
            "$label ${if (pct >= 0) "+$pct%" else "$pct%"}",
            style = MaterialTheme.typography.labelSmall,
            color = color,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
        )
    }
}

// ─── Music Pill ──────────────────────────────────────────────────────────────

@Composable
private fun PlaylistPill(suggestion: PlaylistSuggestionDto, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(12.dp),
        color = Color(0xFF64748B).copy(alpha = 0.08f),
        tonalElevation = 0.dp,
    ) {
        Column(
            Modifier.padding(horizontal = 12.dp, vertical = 8.dp).width(140.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.MusicNote, contentDescription = null, modifier = Modifier.size(12.dp), tint = Color(0xFF64748B))
                Text(
                    suggestion.name,
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
            Text(suggestion.mood, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
            if (suggestion.bpm.isNotBlank()) {
                Text("${suggestion.bpm} BPM", style = MaterialTheme.typography.labelSmall, color = Color(0xFF64748B))
            }
        }
    }
}

// ─── Empty States ────────────────────────────────────────────────────────────

@Composable
private fun EmptyWorkoutState() {
    Column(
        Modifier
            .fillMaxWidth()
            .padding(40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text("🏋️", style = MaterialTheme.typography.displaySmall)
        Text("No Workout Plan", style = MaterialTheme.typography.titleMedium)
        Text(
            "Generate a plan from the Adjust tab to see your weekly workouts.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun NoWorkoutForDay(date: LocalDate) {
    Column(
        Modifier
            .fillMaxWidth()
            .padding(40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text("😴", style = MaterialTheme.typography.displaySmall)
        Text("Rest Day", style = MaterialTheme.typography.titleMedium)
        Text(
            "No workout scheduled for ${date.dayOfWeek.name.lowercase().replaceFirstChar { it.uppercaseChar() }}.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

// ─── Import Dialog ───────────────────────────────────────────────────────────

private enum class WorkoutImportTab { Url, Pdf }

@Composable
private fun WorkoutImportDialog(
    workoutExtrasRepository: WorkoutExtrasRepository,
    onDismiss: () -> Unit,
    onImport: (WorkoutDayDto) -> Unit,
    onReplaceProgram: (List<WorkoutDayDto>) -> Unit,
) {
    val context = LocalContext.current
    var tab by remember { mutableStateOf(WorkoutImportTab.Url) }
    var urlText by remember { mutableStateOf("") }
    var pdfName by remember { mutableStateOf<String?>(null) }
    var pdfBytes by remember { mutableStateOf<ByteArray?>(null) }
    var isImporting by remember { mutableStateOf(false) }
    var imported by remember { mutableStateOf<ParseWorkoutUrlResponseDto?>(null) }
    var importError by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    val pickPdf = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            importError = null
            runCatching {
                context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                    ?: error("Could not read PDF")
            }.fold(
                onSuccess = { bytes ->
                    pdfBytes = bytes
                    pdfName = uri.lastPathSegment ?: "workout.pdf"
                    imported = null
                },
                onFailure = { importError = it.message ?: "Could not read PDF" },
            )
        }
    }

    fun resetPreview() {
        imported = null
        importError = null
    }

    Dialog(onDismissRequest = onDismiss) {
        Card(shape = RoundedCornerShape(16.dp)) {
            Column(
                Modifier
                    .padding(20.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text("Import workout", style = MaterialTheme.typography.titleMedium)
                Text(
                    "Paste a program URL or upload a text-based PDF. Multi-day programs import all sessions when detected.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                    SegmentedButton(
                        selected = tab == WorkoutImportTab.Url,
                        onClick = { tab = WorkoutImportTab.Url; resetPreview() },
                        shape = SegmentedButtonDefaults.itemShape(index = 0, count = 2),
                    ) { Text("URL") }
                    SegmentedButton(
                        selected = tab == WorkoutImportTab.Pdf,
                        onClick = { tab = WorkoutImportTab.Pdf; resetPreview() },
                        shape = SegmentedButtonDefaults.itemShape(index = 1, count = 2),
                    ) { Text("PDF") }
                }
                when (tab) {
                    WorkoutImportTab.Url -> {
                        OutlinedTextField(
                            value = urlText,
                            onValueChange = { urlText = it; resetPreview() },
                            label = { Text("URL") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                        )
                    }
                    WorkoutImportTab.Pdf -> {
                        Row(
                            Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            OutlinedButton(onClick = { pickPdf.launch("application/pdf") }) {
                                Text(if (pdfName != null) "Change PDF" else "Choose PDF")
                            }
                            pdfName?.let {
                                Text(
                                    it,
                                    style = MaterialTheme.typography.bodySmall,
                                    modifier = Modifier.weight(1f),
                                )
                            }
                        }
                    }
                }
                importError?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                }
                imported?.let { result ->
                    val programDays = result.days?.takeIf { it.size > 1 }
                    if (programDays != null) {
                        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow)) {
                            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                result.programTitle?.let {
                                    Text(it, style = MaterialTheme.typography.labelLarge)
                                }
                                Text(
                                    "${programDays.size} sessions — first session ${formatFirstSessionPreview(programDays)}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    } else {
                        val day = result.workout
                        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow)) {
                            Column(Modifier.padding(12.dp)) {
                                Text("Imported: ${day.day}", style = MaterialTheme.typography.labelLarge)
                                Text(day.focus, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text("${day.exercises.size} exercises", style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = onDismiss, modifier = Modifier.weight(1f)) { Text("Cancel") }
                    imported?.let { result ->
                        val programDays = result.days?.takeIf { it.size > 1 }
                        if (programDays != null) {
                            Button(
                                onClick = { onReplaceProgram(programDays) },
                                modifier = Modifier.weight(1f),
                            ) { Text("Replace Plan") }
                        } else {
                            Button(
                                onClick = { onImport(result.workout) },
                                modifier = Modifier.weight(1f),
                            ) { Text("Add to Plan") }
                        }
                    } ?: run {
                        val canImport = when (tab) {
                            WorkoutImportTab.Url -> urlText.isNotBlank()
                            WorkoutImportTab.Pdf -> pdfBytes != null
                        }
                        Button(
                            onClick = {
                                isImporting = true
                                importError = null
                                scope.launch {
                                    val parseResult = when (tab) {
                                        WorkoutImportTab.Url ->
                                            workoutExtrasRepository.parseWorkoutUrl(urlText.trim())
                                        WorkoutImportTab.Pdf ->
                                            workoutExtrasRepository.parseWorkoutPdf(
                                                pdfBytes ?: ByteArray(0),
                                                pdfName ?: "workout.pdf",
                                            )
                                    }
                                    parseResult.fold(
                                        onSuccess = { imported = it },
                                        onFailure = { importError = it.message ?: "Import failed" },
                                    )
                                    isImporting = false
                                }
                            },
                            enabled = canImport && !isImporting,
                            modifier = Modifier.weight(1f),
                        ) {
                            if (isImporting) {
                                CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(16.dp))
                            } else {
                                Text(if (tab == WorkoutImportTab.Pdf) "Extract from PDF" else "Import")
                            }
                        }
                    }
                }
            }
        }
    }
}

// ─── Rest Timer ──────────────────────────────────────────────────────────────

@Composable
private fun RestTimerBanner(
    state: RestTimerState,
    onSkip: () -> Unit,
    onAdd15: () -> Unit,
    onFinished: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var remaining by remember(state.endEpochMs) { mutableStateOf(state.remainingSeconds()) }
    LaunchedEffect(state.endEpochMs) {
        while (true) {
            val secondsLeft = state.remainingSeconds()
            remaining = secondsLeft
            if (secondsLeft <= 0) {
                onFinished()
                break
            }
            delay(1000)
        }
    }

    if (remaining <= 0) return

    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh),
    ) {
        Column(
            Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(
                Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        "Rest",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        state.exerciseName,
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium,
                        maxLines = 1,
                    )
                }
                Text(
                    formatRestCountdown(remaining),
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary,
                )
            }

            LinearProgressIndicator(
                progress = { remaining.toFloat() / state.totalSeconds.coerceAtLeast(1) },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(6.dp)
                    .clip(RoundedCornerShape(50)),
            )

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = onSkip, contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp, vertical = 4.dp)) {
                    Text("Skip", style = MaterialTheme.typography.labelMedium)
                }
                OutlinedButton(onClick = onAdd15, contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp, vertical = 4.dp)) {
                    Text("+15s", style = MaterialTheme.typography.labelMedium)
                }
            }
        }
    }
}

private fun formatRestCountdown(seconds: Int): String {
    val m = seconds / 60
    val s = seconds % 60
    return if (m > 0) String.format("%d:%02d", m, s) else "${s}s"
}
