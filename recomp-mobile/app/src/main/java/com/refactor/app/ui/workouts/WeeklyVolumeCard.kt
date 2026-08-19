package com.refactor.app.ui.workouts

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.refactor.app.api.MuscleVolume

/**
 * Hard sets per muscle this week against MEV/MRV landmarks.
 *
 * This is the number that most often explains a stalled physique: the scale moves,
 * lifts climb, but a group like hamstrings or rear delts never clears its minimum.
 *
 * Mirrors web `WeeklyVolumeCard.tsx` and iOS `WeeklyVolumeCard.swift`.
 */
@Composable
fun WeeklyVolumeCard(
    summary: MuscleVolume.Summary,
    modifier: Modifier = Modifier,
) {
    if (summary.totalHardSets == 0) return

    val trained = summary.entries.filter { it.sets > 0 }
    val untouched = summary.entries.filter { it.sets == 0.0 }

    Card(modifier = modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "Weekly volume",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    "${summary.totalHardSets} hard sets",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            trained.forEach { entry -> VolumeRow(entry) }

            if (summary.overdosed.isNotEmpty()) {
                Text(
                    "Past the recoverable ceiling: ${summary.overdosed.joinToString { it.label }}. " +
                        "Trim sets here rather than adding more.",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }

            if (untouched.isNotEmpty()) {
                Text(
                    "No sets logged this week: ${untouched.joinToString { it.muscle.label }}.",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            if (summary.unclassifiedExercises.isNotEmpty()) {
                Text(
                    "Not counted (unrecognized): ${summary.unclassifiedExercises.joinToString()}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                )
            }
        }
    }
}

@Composable
private fun VolumeRow(entry: MuscleVolume.Entry) {
    val tint: Color = when (entry.status) {
        MuscleVolume.Status.UNDER -> MaterialTheme.colorScheme.tertiary
        MuscleVolume.Status.OPTIMAL, MuscleVolume.Status.HIGH -> MaterialTheme.colorScheme.primary
        MuscleVolume.Status.OVER -> MaterialTheme.colorScheme.error
    }

    // Bars are scaled against MRV so every group shares one visual scale.
    val fill = if (entry.landmarks.mrv > 0) {
        (entry.sets / entry.landmarks.mrv).coerceIn(0.0, 1.0).toFloat()
    } else 0f

    val setsLabel =
        if (entry.sets == Math.floor(entry.sets)) entry.sets.toInt().toString()
        else String.format("%.1f", entry.sets)

    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                entry.muscle.label,
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.Medium,
            )
            Text(
                "$setsLabel / ${entry.landmarks.mev}–${entry.landmarks.mrv} sets",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Box(
            Modifier
                .fillMaxWidth()
                .height(6.dp)
                .clip(RoundedCornerShape(3.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant),
        ) {
            Box(
                Modifier
                    .fillMaxWidth(fill)
                    .height(6.dp)
                    .clip(RoundedCornerShape(3.dp))
                    .background(tint),
            )
        }
    }
}
