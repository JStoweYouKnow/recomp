package com.refactor.app.ui.dashboard

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.refactor.app.api.DietPhase
import kotlin.math.abs

/**
 * Where the diet actually stands — trend weight, weekly rate, and what should change.
 *
 * The scale number people react to is mostly water. This shows the trend and judges the
 * *rate*, which is the part that decides whether the weight coming off is fat or muscle.
 *
 * Mirrors web `DietPhaseCard.tsx` and iOS `DietPhaseCard.swift`.
 */
@Composable
fun DietPhaseCard(
    assessment: DietPhase.Assessment,
    currentCalories: Int,
    modifier: Modifier = Modifier,
) {
    val trend = assessment.trend
    if (trend.weighInCount == 0) return

    val verdictTint: Color = when (assessment.rateVerdict) {
        DietPhase.RateVerdict.ON_TRACK -> MaterialTheme.colorScheme.primary
        DietPhase.RateVerdict.TOO_FAST, DietPhase.RateVerdict.WRONG_DIRECTION -> MaterialTheme.colorScheme.error
        DietPhase.RateVerdict.TOO_SLOW, DietPhase.RateVerdict.STALLED -> MaterialTheme.colorScheme.tertiary
    }
    val verdictLabel = when (assessment.rateVerdict) {
        DietPhase.RateVerdict.ON_TRACK -> "On track"
        DietPhase.RateVerdict.TOO_FAST -> "Too fast"
        DietPhase.RateVerdict.TOO_SLOW -> "Too slow"
        DietPhase.RateVerdict.STALLED -> "Stalled"
        DietPhase.RateVerdict.WRONG_DIRECTION -> "Off course"
    }
    val rateLabel = if (trend.weeklyChangeLbs == 0.0) {
        "holding steady"
    } else {
        val sign = if (trend.weeklyChangeLbs > 0) "+" else "−"
        "$sign${String.format("%.1f", abs(trend.weeklyChangeLbs))} lb/week"
    }

    Card(modifier = modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    (assessment.suggestedPhase ?: assessment.phase).label.uppercase(),
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier
                        .background(
                            MaterialTheme.colorScheme.primary.copy(alpha = 0.12f),
                            RoundedCornerShape(50),
                        )
                        .padding(horizontal = 8.dp, vertical = 3.dp),
                )
                if (trend.reliable) {
                    Text(
                        verdictLabel.uppercase(),
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = verdictTint,
                        modifier = Modifier
                            .background(verdictTint.copy(alpha = 0.12f), RoundedCornerShape(50))
                            .padding(horizontal = 8.dp, vertical = 3.dp),
                    )
                }
            }

            Column {
                Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        String.format("%.1f", trend.trendWeightLbs),
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        "lb trend",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(bottom = 3.dp),
                    )
                }
                Text(
                    "Last weigh-in ${String.format("%.1f", trend.latestWeightLbs)} lb · $rateLabel",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Text(
                assessment.headline,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
            )

            assessment.details.forEach { detail ->
                Text(
                    detail,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            if (assessment.calorieAdjustment != 0) {
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
                ) {
                    Column(Modifier.padding(8.dp)) {
                        Text(
                            "Suggested target",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Row(
                            verticalAlignment = Alignment.Bottom,
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Text(
                                "${currentCalories + assessment.calorieAdjustment} kcal/day",
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Text(
                                "(${if (assessment.calorieAdjustment > 0) "+" else ""}${assessment.calorieAdjustment})",
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
