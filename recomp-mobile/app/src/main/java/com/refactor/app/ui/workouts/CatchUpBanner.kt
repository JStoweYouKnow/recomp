package com.refactor.app.ui.workouts

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
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
import com.refactor.app.api.dto.FitnessPlanDto
import com.refactor.app.api.dto.MissedSessionDto
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale

@Composable
fun CatchUpBanner(
    plan: FitnessPlanDto,
    progress: WorkoutProgressMap,
    modifier: Modifier = Modifier,
    onApplyAction: suspend (ScheduleAction) -> String?,
    onDismiss: suspend () -> Unit,
    onAskCoach: suspend () -> String?,
) {
    if (!WorkoutScheduleService.shouldShowCatchUpBanner(plan, progress)) return

    val scope = rememberCoroutineScope()
    var message by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }
    val missedCount = WorkoutScheduleService.countRecentMissed(plan, progress)
    val isMultiWeek =
        plan.workoutPlan?.programWeek1Start != null && (plan.workoutPlan?.weeklyPlan?.size ?: 0) > 7

    Surface(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        tonalElevation = 2.dp,
        shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.tertiaryContainer,
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Column(Modifier.weight(1f)) {
                    Text(
                        "You missed $missedCount workout sessions this week",
                        style = MaterialTheme.typography.titleSmall,
                    )
                    Text(
                        if (isMultiWeek) {
                            "Your program week may have moved ahead. Choose how to get back on track."
                        } else {
                            "Pick whether to catch up, skip ahead, or repeat last week."
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                TextButton(onClick = { scope.launch { onDismiss() } }) { Text("Dismiss") }
            }
            message?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Row(
                Modifier.horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (isMultiWeek) {
                    OutlinedButton(enabled = !loading, onClick = {
                        scope.launch {
                            loading = true
                            message = onApplyAction(ScheduleAction.stay_on_week)
                            loading = false
                        }
                    }) { Text("Stay on week") }
                }
                OutlinedButton(enabled = !loading, onClick = {
                    scope.launch {
                        loading = true
                        message = onApplyAction(ScheduleAction.catch_up)
                        loading = false
                    }
                }) { Text("Catch up") }
                OutlinedButton(enabled = !loading, onClick = {
                    scope.launch {
                        loading = true
                        message = onApplyAction(ScheduleAction.skip_week)
                        loading = false
                    }
                }) { Text("Skip & continue") }
                Button(enabled = !loading, onClick = {
                    scope.launch {
                        loading = true
                        message = onAskCoach()
                        loading = false
                    }
                }) { Text(if (loading) "…" else "Ask coach") }
            }
        }
    }
}

@Composable
fun CatchUpQueue(
    plan: FitnessPlanDto,
    modifier: Modifier = Modifier,
    onOpenDate: (String) -> Unit,
) {
    val queue = WorkoutScheduleService.getCatchUpQueue(plan)
    if (queue.isEmpty()) return

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text("Catch-up queue (${queue.size})", style = MaterialTheme.typography.titleSmall)
        Text(
            "Missed sessions you can still complete or reschedule.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        queue.forEach { item -> CatchUpQueueRow(item, onOpenDate) }
    }
}

@Composable
private fun CatchUpQueueRow(item: MissedSessionDto, onOpenDate: (String) -> Unit) {
    Surface(shape = MaterialTheme.shapes.medium, tonalElevation = 1.dp) {
        Row(
            Modifier
                .fillMaxWidth()
                .padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
        ) {
            Column {
                Text(item.dayLabel ?: "Workout", style = MaterialTheme.typography.bodyMedium)
                item.focus?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Text(
                    "Scheduled ${item.scheduledDate}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            OutlinedButton(onClick = { onOpenDate(item.rescheduledTo ?: item.scheduledDate) }) {
                Text("Open")
            }
        }
    }
}

fun formatProgramStartLabel(anchorMonday: String): String {
    val d = runCatching { LocalDate.parse(anchorMonday) }.getOrNull() ?: return anchorMonday
    val day = d.dayOfWeek.getDisplayName(TextStyle.FULL, Locale.getDefault())
    val month = d.month.getDisplayName(TextStyle.SHORT, Locale.getDefault())
    return "$day, $month ${d.dayOfMonth}"
}

fun formatFirstSessionPreview(days: List<com.refactor.app.api.dto.WorkoutDayDto>): String {
    val first = WorkoutImportStart.inferFirstSessionDate(days)
    val day = first.dayOfWeek.getDisplayName(TextStyle.FULL, Locale.getDefault())
    val month = first.month.getDisplayName(TextStyle.SHORT, Locale.getDefault())
    return "$day, $month ${first.dayOfMonth} (${first.format(DateTimeFormatter.ISO_LOCAL_DATE)})"
}
