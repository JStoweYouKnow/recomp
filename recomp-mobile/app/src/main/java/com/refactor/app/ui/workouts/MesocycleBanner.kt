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
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.refactor.app.api.Mesocycle

/**
 * Where the lifter is in the current training block.
 *
 * Without this, a multi-week program is an undifferentiated wall of sessions. Naming the
 * phase is what makes a lighter week read as strategy rather than as falling behind.
 *
 * Mirrors web `MesocycleBanner.tsx` and iOS `MesocycleBanner.swift`.
 */
@Composable
fun MesocycleBanner(
    resolution: Mesocycle.Resolution,
    modifier: Modifier = Modifier,
) {
    val state = resolution.state
    val tint: Color = when (state.phase) {
        Mesocycle.Phase.ACCUMULATION -> MaterialTheme.colorScheme.primary
        Mesocycle.Phase.PEAK -> MaterialTheme.colorScheme.secondary
        Mesocycle.Phase.DELOAD -> MaterialTheme.colorScheme.tertiary
    }
    val showWarning = resolution.deload.urgency == Mesocycle.DeloadUrgency.SOON && !resolution.deloadForced

    Card(modifier = modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    state.phase.label.uppercase(),
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    color = tint,
                    modifier = Modifier
                        .background(tint.copy(alpha = 0.12f), RoundedCornerShape(50))
                        .padding(horizontal = 8.dp, vertical = 3.dp),
                )
                Text(
                    "Week ${state.weekInBlock} of ${state.blockLength}",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                )
                Text(
                    "Block ${state.blockNumber}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (resolution.deloadForced) {
                    Text(
                        "Pulled forward",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.tertiary,
                        modifier = Modifier
                            .background(
                                MaterialTheme.colorScheme.tertiary.copy(alpha = 0.15f),
                                RoundedCornerShape(50),
                            )
                            .padding(horizontal = 6.dp, vertical = 2.dp),
                    )
                }
            }

            Text(
                state.summary,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            // Week dots make the block's shape legible at a glance.
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                for (week in 1..state.blockLength) {
                    val dotColor = when {
                        week == state.weekInBlock -> MaterialTheme.colorScheme.primary
                        week < state.weekInBlock -> MaterialTheme.colorScheme.primary.copy(alpha = 0.4f)
                        week == state.blockLength -> MaterialTheme.colorScheme.tertiary.copy(alpha = 0.3f)
                        else -> MaterialTheme.colorScheme.surfaceVariant
                    }
                    Box(
                        Modifier
                            .weight(1f)
                            .height(5.dp)
                            .clip(RoundedCornerShape(3.dp))
                            .background(dotColor),
                    )
                }
            }

            if ((resolution.deloadForced || showWarning) && resolution.deload.reasons.isNotEmpty()) {
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
                ) {
                    Column(Modifier.padding(8.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        Text(
                            if (resolution.deloadForced) "Why this week is a deload" else "A deload is coming",
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                        resolution.deload.reasons.forEach { reason ->
                            Text(
                                "• $reason",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }
    }
}
