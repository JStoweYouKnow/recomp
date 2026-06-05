package com.refactor.app.ui.dashboard

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.refactor.app.api.SyncRepository
import com.refactor.app.api.dto.MealMacrosDto
import com.refactor.app.api.dto.SyncGetResponse
import com.refactor.app.db.SyncCacheDao
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
    val snackbarHostState = remember { SnackbarHostState() }
    val today = remember { todayIso() }
    val firstName = remember(authDisplayName) {
        authDisplayName.trim().split(" ").firstOrNull()?.takeIf { it.isNotEmpty() } ?: "there"
    }

    LaunchedEffect(uploadFeedback) {
        val fb = uploadFeedback ?: return@LaunchedEffect
        snackbarHostState.showSnackbar(message = fb.message, duration = SnackbarDuration.Short, withDismissAction = true)
        vm.dismissUploadFeedback()
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(title = { Text("Today", style = MaterialTheme.typography.titleLarge) })
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
                AvatarCircle(name = authDisplayName, size = 44.dp)
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
                        DashboardContent(
                            snap = s2,
                            today = today,
                            checkInMessage = checkInMessage,
                            checkInLoading = checkInLoading,
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
}

@Composable
private fun DashboardContent(
    snap: SyncGetResponse,
    today: String,
    checkInMessage: String?,
    checkInLoading: Boolean,
    onCheckIn: () -> Unit,
    onAddHydration: (Int) -> Unit,
    onRemoveHydration: (Int) -> Unit,
    onStartFast: () -> Unit,
    onEndFast: () -> Unit,
    onLogBiofeedback: (Int, Int, Int, Int, Int) -> Unit,
) {
    val targets = snap.plan?.dietPlan?.dailyTargets ?: MealMacrosDto()
    val consumed = sumMacrosForDate(snap.meals, today)
    val derivedConsumedCal = (consumed.protein * 4 + consumed.carbs * 4 + consumed.fat * 9).roundToInt()
    val derivedTargetCal = (targets.protein * 4 + targets.carbs * 4 + targets.fat * 9).roundToInt()
    val baseCal = derivedTargetCal.coerceAtLeast(1)
    val actAdj = activityCalorieAdjustmentForDate(snap.activityLog, today)
    val adjustedTarget = maxOf(1, baseCal + actAdj)

    // Calorie budget + macro pills
    CalorieBudgetCard(
        consumed = derivedConsumedCal,
        target = adjustedTarget,
        baseCalories = baseCal,
        activityAdjustment = actAdj,
    )
    MacroPillsRow(
        consumed = consumed.copy(calories = derivedConsumedCal.toDouble()),
        targets = targets.copy(calories = baseCal.toDouble()),
    )

    // Today's workout
    val workoutDay = snap.plan?.workoutPlan?.weeklyPlan?.firstOrNull()
    TodaysWorkoutHighlightCard(workoutDay)

    // Adaptive TDEE
    AdaptiveTdeeCard(snap.profile)

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
}
