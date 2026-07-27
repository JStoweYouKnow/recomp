package com.refactor.app.ui.dashboard

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Surface
import androidx.compose.foundation.shape.RoundedCornerShape
import com.refactor.app.util.StreakCalculator
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilterChip
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.refactor.app.api.SyncRepository
import com.refactor.app.api.dto.MealMacrosDto
import com.refactor.app.api.dto.RegeneratePlanOptions
import com.refactor.app.api.dto.SyncGetResponse
import com.refactor.app.db.SyncCacheDao
import com.refactor.app.ui.legal.MedicalDisclaimerText
import com.refactor.app.ui.workouts.WorkoutProgramSchedule
import java.time.LocalDate
import kotlin.math.roundToInt

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(
    authDisplayName: String,
    syncRepository: SyncRepository,
    syncCacheDao: SyncCacheDao,
) {
    val appContext = LocalContext.current.applicationContext
    val vm: DashboardViewModel = viewModel(
        factory = DashboardViewModel.Factory(syncRepository, syncCacheDao, appContext)
    )
    val ui by vm.state.collectAsStateWithLifecycle()
    val snap by vm.snapshot.collectAsStateWithLifecycle()
    val uploadFeedback by vm.uploadFeedback.collectAsStateWithLifecycle()
    val checkInMessage by vm.checkInMessage.collectAsStateWithLifecycle()
    val checkInLoading by vm.checkInLoading.collectAsStateWithLifecycle()
    val applyingTdeeTargets by vm.applyingTdeeTargets.collectAsStateWithLifecycle()
    val regeneratingPlan by vm.regeneratingPlan.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    val today = remember { todayIso() }
    val firstName = remember(authDisplayName) {
        authDisplayName.trim().split(" ").firstOrNull()?.takeIf { it.isNotEmpty() } ?: "there"
    }
    val defaultDays = snap?.profile?.workoutDaysPerWeek?.coerceIn(2, 7) ?: 4
    var programWeeks by remember { mutableIntStateOf(1) }
    var workoutDaysPerWeek by remember(defaultDays) { mutableIntStateOf(defaultDays) }
    var showRegenerateDialog by remember { mutableStateOf(false) }

    LaunchedEffect(defaultDays) {
        workoutDaysPerWeek = defaultDays
    }

    val runRegenerate: () -> Unit = {
        vm.regeneratePlan(
            RegeneratePlanOptions(
                programWeeks = programWeeks.takeIf { it > 1 },
                workoutDaysPerWeek = workoutDaysPerWeek,
            ),
        )
    }

    LaunchedEffect(uploadFeedback) {
        val fb = uploadFeedback ?: return@LaunchedEffect
        snackbarHostState.showSnackbar(message = fb.message, duration = SnackbarDuration.Short, withDismissAction = true)
        vm.dismissUploadFeedback()
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = { Text("Today", style = MaterialTheme.typography.titleLarge) },
                actions = {
                    if (snap?.plan != null) {
                        IconButton(
                            onClick = { showRegenerateDialog = true },
                            enabled = !regeneratingPlan,
                        ) {
                            if (regeneratingPlan) {
                                CircularProgressIndicator(strokeWidth = 2.dp)
                            } else {
                                Icon(Icons.Filled.Refresh, contentDescription = "Regenerate plan")
                            }
                        }
                    }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Spacer(Modifier.height(4.dp))

            // Greeting row — mirrors iOS greetingSection
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Text(greetingForHour(firstName), style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold))
                    Text(today, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    val streak = remember(snap) {
                        StreakCalculator.streakLength(snap?.meals.orEmpty().map { it.date })
                    }
                    if (streak >= 2) StreakBadge(streak)
                    AvatarCircle(name = authDisplayName, size = 44.dp)
                }
            }

            when (val s = ui) {
                DashboardUiState.Loading -> {
                    CircularProgressIndicator()
                    Text("Loading…", style = MaterialTheme.typography.bodyMedium)
                }
                is DashboardUiState.Error -> {
                    Text(s.message, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
                    Button(onClick = { vm.refresh() }) { Text("Retry") }
                }
                is DashboardUiState.Ready -> {
                    snap?.let { s2 ->
                        if (regeneratingPlan) {
                            PlanGeneratingCard(programWeeks = programWeeks)
                        } else if (s2.plan == null) {
                            NoPlanCard(
                                programWeeks = programWeeks,
                                workoutDaysPerWeek = workoutDaysPerWeek,
                                onProgramWeeksChange = { programWeeks = it },
                                onWorkoutDaysPerWeekChange = { workoutDaysPerWeek = it },
                                onGenerate = runRegenerate,
                            )
                        } else {
                            PlanRegenerateCard(
                                programWeeks = programWeeks,
                                workoutDaysPerWeek = workoutDaysPerWeek,
                                onProgramWeeksChange = { programWeeks = it },
                                onWorkoutDaysPerWeekChange = { workoutDaysPerWeek = it },
                                onRegenerate = runRegenerate,
                            )
                        }
                        DashboardContent(
                            snap = s2,
                            today = today,
                            checkInMessage = checkInMessage,
                            checkInLoading = checkInLoading,
                            applyingTdeeTargets = applyingTdeeTargets,
                            onApplyTdeeToTargets = { vm.applyTdeeToTargets(it) },
                            onCheckIn = { vm.fetchCheckIn() },
                            onAddHydration = { vm.addHydration(it) },
                            onRemoveHydration = { vm.removeHydration(it) },
                            onStartFast = { vm.startFast() },
                            onEndFast = { vm.endFast() },
                            onLogBiofeedback = { e, m, h, s3, r -> vm.logBiofeedback(e, m, h, s3, r) },
                        )
                    }
                }
            }

            Spacer(Modifier.height(8.dp))
        }
    }

    if (showRegenerateDialog) {
        AlertDialog(
            onDismissRequest = { showRegenerateDialog = false },
            title = { Text("Regenerate program") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(
                        "Build a fresh meal and workout plan. This replaces your current program.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    PlanGenerateOptionsContent(
                        programWeeks = programWeeks,
                        workoutDaysPerWeek = workoutDaysPerWeek,
                        onProgramWeeksChange = { programWeeks = it },
                        onWorkoutDaysPerWeekChange = { workoutDaysPerWeek = it },
                    )
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showRegenerateDialog = false
                        runRegenerate()
                    },
                ) { Text("Regenerate") }
            },
            dismissButton = {
                TextButton(onClick = { showRegenerateDialog = false }) { Text("Cancel") }
            },
        )
    }
}

@Composable
private fun DashboardContent(
    snap: SyncGetResponse,
    today: String,
    checkInMessage: String?,
    checkInLoading: Boolean,
    applyingTdeeTargets: Boolean,
    onApplyTdeeToTargets: (Int) -> Unit,
    onCheckIn: () -> Unit,
    onAddHydration: (Int) -> Unit,
    onRemoveHydration: (Int) -> Unit,
    onStartFast: () -> Unit,
    onEndFast: () -> Unit,
    onLogBiofeedback: (Int, Int, Int, Int, Int) -> Unit,
) {
    val targets = todaysMacroTargets(snap)
    val consumed = sumMacrosForDate(snap.meals, today)
    val baseCal = targets.calories.roundToInt().coerceAtLeast(1)
    val consumedCal = consumed.calories.roundToInt()
    val actAdj = activityCalorieAdjustmentForDate(snap.activityLog, today)
    val adjustedTarget = maxOf(1, baseCal + actAdj)

    // Calorie budget + macro pills (same sources as iOS DashboardView)
    CalorieBudgetCard(
        consumed = consumedCal,
        target = adjustedTarget,
        baseCalories = baseCal,
        activityAdjustment = actAdj,
    )
    MacroPillsRow(consumed = consumed, targets = targets)

    // Today's workout — match by day-of-week and program week, same logic as iOS
    val workoutDay = snap.plan?.let { plan ->
        WorkoutProgramSchedule.planIndexForDate(plan, LocalDate.now())
            ?.let { plan.workoutPlan?.weeklyPlan?.getOrNull(it) }
    }
    TodaysWorkoutHighlightCard(workoutDay)

    // Adaptive TDEE
    AdaptiveTdeeCard(
        profile = snap.profile,
        metabolicModel = snap.metabolicModel,
        applyingTargets = applyingTdeeTargets,
        onApplyToTargets = if (snap.plan?.dietPlan != null) onApplyTdeeToTargets else null,
    )

    // Coach Check-In
    CoachCheckInCard(message = checkInMessage, loading = checkInLoading, onFetch = onCheckIn)

    // 2-column widget grid
    val hydrationMl = hydrationTotalMlForDate(snap.hydration, today)
    val fastingSession = activeFastingSession(snap.fastingSessions)
    val biofeedbackEntry = latestBiofeedbackToday(snap.biofeedback, today)

    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        HydrationWidgetCard(
            ml = hydrationMl,
            onAdd = onAddHydration,
            onRemove = onRemoveHydration,
            modifier = Modifier.weight(1f),
        )
        FastingWidgetCard(
            session = fastingSession,
            onStart = onStartFast,
            onEnd = onEndFast,
            modifier = Modifier.weight(1f),
        )
    }
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        BiofeedbackWidgetCard(
            existingEntry = biofeedbackEntry,
            onLog = onLogBiofeedback,
            modifier = Modifier.weight(1f),
        )
        DailyQuestsWidget(modifier = Modifier.weight(1f))
    }

    MedicalDisclaimerText(Modifier.padding(top = 12.dp))
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun PlanGenerateOptionsContent(
    programWeeks: Int,
    workoutDaysPerWeek: Int,
    onProgramWeeksChange: (Int) -> Unit,
    onWorkoutDaysPerWeekChange: (Int) -> Unit,
) {
    val weekOptions = listOf(1, 4, 8, 12)
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Program length", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            weekOptions.forEach { weeks ->
                FilterChip(
                    selected = programWeeks == weeks,
                    onClick = { onProgramWeeksChange(weeks) },
                    label = { Text(if (weeks == 1) "1 week" else "$weeks weeks") },
                )
            }
        }
        if (programWeeks > 1) {
            Text(
                "Multi-week programs build in chunks and may take a few minutes.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Text("Training days per week", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            (2..7).forEach { days ->
                FilterChip(
                    selected = workoutDaysPerWeek == days,
                    onClick = { onWorkoutDaysPerWeekChange(days) },
                    label = { Text("$days days") },
                )
            }
        }
    }
}

@Composable
private fun NoPlanCard(
    programWeeks: Int,
    workoutDaysPerWeek: Int,
    onProgramWeeksChange: (Int) -> Unit,
    onWorkoutDaysPerWeekChange: (Int) -> Unit,
    onGenerate: () -> Unit,
) {
    Card(
        Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("No plan yet", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text(
                "Generate a personalized meal and workout plan from your profile.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            PlanGenerateOptionsContent(
                programWeeks = programWeeks,
                workoutDaysPerWeek = workoutDaysPerWeek,
                onProgramWeeksChange = onProgramWeeksChange,
                onWorkoutDaysPerWeekChange = onWorkoutDaysPerWeekChange,
            )
            Button(onClick = onGenerate) { Text("Generate my plan") }
        }
    }
}

@Composable
private fun PlanRegenerateCard(
    programWeeks: Int,
    workoutDaysPerWeek: Int,
    onProgramWeeksChange: (Int) -> Unit,
    onWorkoutDaysPerWeekChange: (Int) -> Unit,
    onRegenerate: () -> Unit,
) {
    Card(
        Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text("Regenerate program", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            Text(
                "Build a fresh meal and workout plan. Replaces your current program.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            PlanGenerateOptionsContent(
                programWeeks = programWeeks,
                workoutDaysPerWeek = workoutDaysPerWeek,
                onProgramWeeksChange = onProgramWeeksChange,
                onWorkoutDaysPerWeekChange = onWorkoutDaysPerWeekChange,
            )
            OutlinedButton(onClick = onRegenerate) { Text("Regenerate plan") }
        }
    }
}

@Composable
private fun PlanGeneratingCard(programWeeks: Int = 1) {
    Card(
        Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            CircularProgressIndicator()
            Text("Creating your plan…", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text(
                if (programWeeks > 1) {
                    "Building your $programWeeks-week program. This may take a few minutes."
                } else {
                    "This can take up to a minute."
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/** Flame badge showing the current consecutive-day meal-logging streak. Mirrors iOS StreakBadge. */
@Composable
private fun StreakBadge(days: Int) {
    Surface(
        shape = RoundedCornerShape(50),
        color = Color(0xFFF59E0B).copy(alpha = 0.15f),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Icon(
                Icons.Filled.LocalFireDepartment,
                contentDescription = null,
                tint = Color(0xFFF97316),
                modifier = Modifier.size(16.dp),
            )
            Text(
                "$days",
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}
