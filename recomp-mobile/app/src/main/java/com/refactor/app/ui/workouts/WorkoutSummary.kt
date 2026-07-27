package com.refactor.app.ui.workouts

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt

/** Data for the post-workout recap. Mirrors iOS `WorkoutDaySummary`. */
data class WorkoutSummaryData(
    val dayLabel: String,
    val focus: String,
    val exercisesCompleted: Int,
    val totalExercises: Int,
    val setsLogged: Int,
    val totalVolumeLbs: Double,
    val durationMs: Long?,
)

@Composable
fun WorkoutSummaryDialog(summary: WorkoutSummaryData, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = { TextButton(onClick = onDismiss) { Text("Done") } },
        title = { Text("Workout Complete 🎉") },
        text = {
            Column {
                Text(
                    "${summary.dayLabel} · ${summary.focus}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Column(Modifier.padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    summaryRow("Exercises", "${summary.exercisesCompleted}/${summary.totalExercises}")
                    summaryRow("Sets logged", "${summary.setsLogged}")
                    if (summary.totalVolumeLbs > 0) {
                        summaryRow("Volume", "${summary.totalVolumeLbs.roundToInt()} lbs")
                    }
                    summary.durationMs?.takeIf { it > 0 }?.let { ms ->
                        val minutes = (ms / 60_000.0).roundToInt()
                        val label = if (minutes < 60) "$minutes min" else "${minutes / 60}h ${minutes % 60}m"
                        summaryRow("Duration", label)
                    }
                }
            }
        },
    )
}

@Composable
private fun summaryRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Bold)
    }
}
