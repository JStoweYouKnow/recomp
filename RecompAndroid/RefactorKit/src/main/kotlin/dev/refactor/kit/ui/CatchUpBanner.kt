package dev.refactor.kit.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.refactor.kit.models.FitnessPlan
import dev.refactor.kit.models.ScheduleAction
import dev.refactor.kit.schedule.WorkoutScheduleService
import kotlinx.coroutines.launch

typealias WorkoutProgressMap = Map<String, String>

/**
 * Jetpack Compose banner for missed-workout catch-up. Mirrors web/Swift `CatchUpBanner`.
 */
@Composable
fun CatchUpBanner(
    plan: FitnessPlan,
    progress: WorkoutProgressMap,
    modifier: Modifier = Modifier,
    onUpdatePlan: (FitnessPlan) -> Unit,
    onAskCoach: suspend (FitnessPlan, WorkoutProgressMap) -> FitnessPlan? = { _, _ -> null },
) {
    val scope = rememberCoroutineScope()
    var message by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }

    if (!WorkoutScheduleService.shouldShowCatchUpBanner(plan, progress)) return

    val missedCount = WorkoutScheduleService.countRecentMissed(plan, progress)
    val isMultiWeek = plan.workoutPlan.programWeek1Start != null && plan.workoutPlan.weeklyPlan.size > 7

    Surface(
        modifier = modifier.fillMaxWidth(),
        tonalElevation = 2.dp,
        shape = MaterialTheme.shapes.medium,
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Column {
                    Text("You missed $missedCount workout sessions this week", style = MaterialTheme.typography.titleSmall)
                    Text(
                        if (isMultiWeek) "Your program week may have moved ahead." else "Choose how to get back on track.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                TextButton(onClick = {
                    onUpdatePlan(WorkoutScheduleService.dismissCatchUpBanner(plan))
                }) { Text("Dismiss") }
            }

            message?.let { Text(it, style = MaterialTheme.typography.bodySmall) }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (isMultiWeek) {
                    OutlinedButton(enabled = !loading, onClick = {
                        applyAction(plan, progress, ScheduleAction.stay_on_week, onUpdatePlan) { message = it }
                    }) { Text("Stay on week") }
                }
                OutlinedButton(enabled = !loading, onClick = {
                    applyAction(plan, progress, ScheduleAction.catch_up, onUpdatePlan) { message = it }
                }) { Text("Catch up") }
                OutlinedButton(enabled = !loading, onClick = {
                    applyAction(plan, progress, ScheduleAction.skip_week, onUpdatePlan) { message = it }
                }) { Text("Skip & continue") }
                Button(enabled = !loading, onClick = {
                    scope.launch {
                        loading = true
                        val updated = onAskCoach(plan, progress)
                        if (updated != null) onUpdatePlan(updated) else message = "Could not reach coach."
                        loading = false
                    }
                }) { Text(if (loading) "…" else "Ask coach") }
            }
        }
    }
}

@Composable
fun CatchUpQueue(
    plan: FitnessPlan,
    modifier: Modifier = Modifier,
    onOpenSession: (String) -> Unit,
) {
    val queue = WorkoutScheduleService.getCatchUpQueue(plan)
    if (queue.isEmpty()) return

    Column(modifier = modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Catch-up queue (${queue.size})", style = MaterialTheme.typography.titleSmall)
        queue.forEach { item ->
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Column {
                    Text(item.dayLabel ?: "Workout", style = MaterialTheme.typography.bodyMedium)
                    Text(item.scheduledDate, style = MaterialTheme.typography.bodySmall)
                }
                OutlinedButton(onClick = { onOpenSession(item.rescheduledTo ?: item.scheduledDate) }) {
                    Text("Open")
                }
            }
        }
    }
}

private fun applyAction(
    plan: FitnessPlan,
    progress: WorkoutProgressMap,
    action: ScheduleAction,
    onUpdatePlan: (FitnessPlan) -> Unit,
    onMessage: (String) -> Unit,
) {
    val (wp, summary, _) = WorkoutScheduleService.applyScheduleAction(plan, action, progress)
    onUpdatePlan(plan.copy(workoutPlan = wp))
    onMessage(summary)
}
