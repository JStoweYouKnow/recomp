package com.recomp.app.ui.dashboard

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.recomp.app.api.SyncRepository
import com.recomp.app.api.dto.MealMacrosDto
import com.recomp.app.api.dto.SyncGetResponse
import com.recomp.app.db.SyncCacheDao
import com.recomp.app.ui.screens.ConfigFootnoteCard
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
    val hasCache by vm.hasCachedSnapshot.collectAsStateWithLifecycle()
    val uploading by vm.uploading.collectAsStateWithLifecycle()
    val uploadFeedback by vm.uploadFeedback.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    val today = remember { todayIso() }
    val firstName = remember(authDisplayName) {
        authDisplayName.trim().split(" ").firstOrNull()?.takeIf { it.isNotEmpty() } ?: "there"
    }

    LaunchedEffect(uploadFeedback) {
        val fb = uploadFeedback ?: return@LaunchedEffect
        snackbarHostState.showSnackbar(
            message = fb.message,
            duration = SnackbarDuration.Short,
            withDismissAction = true,
        )
        vm.dismissUploadFeedback()
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = { Text("Today", style = MaterialTheme.typography.titleLarge) },
                actions = {
                    Text(
                        authDisplayName,
                        style = MaterialTheme.typography.labelLarge,
                        modifier = Modifier.padding(end = 12.dp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            )
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            snap?.let { s ->
                Text(greetingForHour(firstName), style = MaterialTheme.typography.titleLarge)
                Text(today, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                DashboardSnapshotSection(snap = s, today = today)
            }

            when (val s = ui) {
                DashboardUiState.Loading -> {
                    CircularProgressIndicator()
                    Text("Loading server data…", style = MaterialTheme.typography.bodyMedium)
                }
                is DashboardUiState.Ready -> {
                    Text(s.profile.name, style = MaterialTheme.typography.titleMedium)
                    Text(
                        "${s.profile.weight} lbs · ${s.profile.goal.replace('_', ' ')} · XP ${s.xp}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    s.hasAdjusted?.let { adjusted ->
                        Text(
                            if (adjusted) "Plan adjusted this block" else "Plan not yet adjusted",
                            style = MaterialTheme.typography.labelLarge
                        )
                    }
                    Button(onClick = { vm.refresh() }) {
                        Text("Refresh sync")
                    }
                    if (hasCache) {
                        OutlinedButton(
                            onClick = { vm.uploadCachedSnapshot() },
                            enabled = !uploading,
                        ) {
                            Text(if (uploading) "Uploading…" else "Upload snapshot to server")
                        }
                    }
                }
                is DashboardUiState.Error -> {
                    Text(
                        s.message,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodyMedium
                    )
                    Button(onClick = { vm.refresh() }) {
                        Text("Retry")
                    }
                    if (hasCache) {
                        OutlinedButton(
                            onClick = { vm.uploadCachedSnapshot() },
                            enabled = !uploading,
                        ) {
                            Text(if (uploading) "Uploading…" else "Upload cached snapshot")
                        }
                    }
                }
            }

            ConfigFootnoteCard()
        }
    }
}

@Composable
private fun DashboardSnapshotSection(snap: SyncGetResponse, today: String) {
    val targets = snap.plan?.dietPlan?.dailyTargets ?: MealMacrosDto()
    val consumed = sumMacrosForDate(snap.meals, today)
    val baseCal = targets.calories.roundToInt().coerceAtLeast(1)
    val actAdj = activityCalorieAdjustmentForDate(snap.activityLog, today)
    val adjustedTarget = maxOf(1, baseCal + actAdj)
    val consumedCal = consumed.calories.roundToInt()

    CalorieBudgetCard(
        consumed = consumedCal,
        target = adjustedTarget,
        baseCalories = baseCal,
        activityAdjustment = actAdj,
    )
    MacroPillsRow(consumed = consumed, targets = targets, Modifier.padding(top = 4.dp))

    val firstDay = snap.plan?.workoutPlan?.weeklyPlan?.firstOrNull()
    TodaysWorkoutHighlightCard(firstDay, Modifier.padding(top = 8.dp))

    Row(
        Modifier
            .fillMaxWidth()
            .padding(top = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            HydrationWidgetCard(hydrationTotalMlForDate(snap.hydration, today))
            BiofeedbackWidgetCard(latestBiofeedbackToday(snap.biofeedback, today))
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            FastingWidgetCard(activeFastingSession(snap.fastingSessions))
            DailyQuestsWidget()
        }
    }
}
