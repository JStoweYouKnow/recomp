package com.refactor.app.ui.workouts

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.refactor.app.api.Progression

/**
 * The computed target for an exercise's next session — the concrete "what to do today" line.
 * Renders nothing when there is no history to progress from, so untracked exercises stay quiet.
 *
 * Mirrors web `ProgressionTarget.tsx` and iOS `ProgressionTargetView.swift`.
 */
@Composable
fun ProgressionTarget(
    prescription: Progression.SetPrescription?,
    modifier: Modifier = Modifier,
) {
    if (prescription == null) return
    // Timed/bodyweight work produces a hold with no load — nothing useful to show.
    if (prescription.action == Progression.Action.HOLD && prescription.targetWeightLbs == null) return

    val tint: Color = when (prescription.action) {
        Progression.Action.ADD_LOAD, Progression.Action.ADD_REPS -> MaterialTheme.colorScheme.primary
        Progression.Action.HOLD, Progression.Action.DELOAD -> MaterialTheme.colorScheme.tertiary
        Progression.Action.ESTABLISH_BASELINE -> MaterialTheme.colorScheme.onSurfaceVariant
    }

    Surface(
        shape = RoundedCornerShape(8.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
        modifier = modifier
            .fillMaxWidth()
            .padding(top = 6.dp),
    ) {
        Column(Modifier.padding(8.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    prescription.action.displayLabel.uppercase(),
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    color = tint,
                    modifier = Modifier
                        .background(tint.copy(alpha = 0.12f), RoundedCornerShape(50))
                        .padding(horizontal = 6.dp, vertical = 2.dp),
                )

                val target = prescription.targetDisplay
                if (target != null) {
                    Text(
                        target,
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        "× ${prescription.targetSets} sets",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    prescription.targetRpe?.let { rpe ->
                        Text(
                            "@ RPE ${rpe.toInt()}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                } else {
                    Text(
                        "Set your baseline",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            Text(
                prescription.rationale,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp),
            )

            prescription.previous?.takeIf { it.weightLbs != null }?.let { previous ->
                val rpeNote = previous.rpe?.let { " @ RPE ${it.toInt()}" } ?: ""
                Text(
                    "Last: ${previous.weightLbs!!.toInt()} lb × ${previous.reps ?: 0}$rpeNote on ${previous.date}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
        }
    }
}
