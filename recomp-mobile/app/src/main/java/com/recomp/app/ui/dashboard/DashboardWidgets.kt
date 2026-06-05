package com.recomp.app.ui.dashboard

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.outlined.Circle
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import com.recomp.app.api.dto.BiofeedbackEntryDto
import com.recomp.app.api.dto.FastingSessionDto
import com.recomp.app.api.dto.HydrationEntryDto
import com.recomp.app.api.dto.MealEntryDto
import com.recomp.app.api.dto.MealMacrosDto
import com.recomp.app.api.dto.WorkoutDayDto
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

private val isoDay: DateTimeFormatter = DateTimeFormatter.ISO_LOCAL_DATE

fun todayIso(zone: ZoneId = ZoneId.systemDefault()): String =
    LocalDate.now(zone).format(isoDay)

fun greetingForHour(firstName: String, zone: ZoneId = ZoneId.systemDefault()): String {
    val hour = ZonedDateTime.now(zone).hour
    val g = when {
        hour < 12 -> "Good morning"
        hour < 17 -> "Good afternoon"
        else -> "Good evening"
    }
    return "$g, $firstName"
}

fun sumMacrosForDate(meals: List<MealEntryDto>?, date: String): MealMacrosDto {
    var c = 0.0
    var p = 0.0
    var cb = 0.0
    var f = 0.0
    meals?.filter { it.date == date }?.forEach { m ->
        val computedCal = m.macros.protein * 4 + m.macros.carbs * 4 + m.macros.fat * 9
        c += if (m.macros.calories > 0) m.macros.calories else computedCal
        p += m.macros.protein
        cb += m.macros.carbs
        f += m.macros.fat
    }
    return MealMacrosDto(c, p, cb, f)
}

fun activityCalorieAdjustmentForDate(log: List<com.recomp.app.api.dto.ActivityLogEntryDto>?, date: String): Int =
    log?.filter { it.date == date }?.sumOf { it.calorieAdjustment } ?: 0

fun hydrationTotalMlForDate(entries: List<HydrationEntryDto>?, date: String): Double =
    entries?.filter { it.date == date }?.sumOf { it.amountMl } ?: 0.0

fun latestBiofeedbackToday(entries: List<BiofeedbackEntryDto>?, date: String): BiofeedbackEntryDto? =
    entries?.filter { it.date == date }?.maxByOrNull { it.time }

fun activeFastingSession(sessions: List<FastingSessionDto>?): FastingSessionDto? =
    sessions?.firstOrNull { it.endTime.isNullOrBlank() }

fun fastingElapsedLabel(session: FastingSessionDto): String {
    val start = runCatching { Instant.parse(session.startTime) }.getOrNull() ?: return "—"
    val hours = ChronoUnit.MINUTES.between(start, Instant.now()) / 60.0
    return "%.1f h / %.0f h goal".format(hours, session.targetHours)
}

@Composable
fun CalorieBudgetCard(
    consumed: Int,
    target: Int,
    baseCalories: Int?,
    activityAdjustment: Int,
    modifier: Modifier = Modifier,
) {
    val remaining = max(target - consumed, 0)
    val over = consumed > target
    val progress = min(consumed.toDouble() / max(target, 1).toDouble(), 1.0)
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Column {
                    Text(
                        if (over) "Over budget" else "Remaining",
                        style = MaterialTheme.typography.labelSmall,
                        color = if (over) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        if (over) "+${consumed - target}" else "$remaining",
                        style = MaterialTheme.typography.displaySmall,
                        color = if (over) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
                    )
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text("${(progress * 100).roundToInt()}%", style = MaterialTheme.typography.titleMedium)
                    Text(
                        "$consumed / $target kcal",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            if (baseCalories != null && activityAdjustment != 0) {
                Text(
                    "$baseCalories base ${if (activityAdjustment > 0) "+" else ""}$activityAdjustment activity",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            LinearProgressIndicator(
                progress = { progress.toFloat() },
                modifier = Modifier.fillMaxWidth().height(10.dp),
            )
        }
    }
}

@Composable
fun MacroPillsRow(consumed: MealMacrosDto, targets: MealMacrosDto, modifier: Modifier = Modifier) {
    Row(
        modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceEvenly,
    ) {
        MacroPill("Cal", consumed.calories.roundToInt(), targets.calories.roundToInt())
        MacroPill("P", consumed.protein.roundToInt(), targets.protein.roundToInt())
        MacroPill("C", consumed.carbs.roundToInt(), targets.carbs.roundToInt())
        MacroPill("F", consumed.fat.roundToInt(), targets.fat.roundToInt())
    }
}

@Composable
private fun MacroPill(label: String, v: Int, t: Int) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
        Text("$v / $t", style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
fun TodaysWorkoutHighlightCard(day: WorkoutDayDto?, modifier: Modifier = Modifier) {
    if (day == null) return
    val slots = (day.warmups?.size ?: 0) + day.exercises.size + (day.finishers?.size ?: 0)
    Card(
        modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
    ) {
        Row(
            Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Column(Modifier.weight(1f)) {
                Text("TODAY'S WORKOUT", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                Text(day.day, style = MaterialTheme.typography.titleMedium)
                Text(day.focus, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Column(horizontalAlignment = Alignment.End) {
                Text("$slots", style = MaterialTheme.typography.headlineMedium, color = MaterialTheme.colorScheme.primary)
                Text("exercises", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
fun HydrationWidgetCard(ml: Double, modifier: Modifier = Modifier) {
    Card(
        modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
    ) {
        Column(Modifier.padding(12.dp)) {
            Text("Hydration", style = MaterialTheme.typography.labelMedium)
            Text("%.0f ml today".format(ml), style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
fun FastingWidgetCard(session: FastingSessionDto?, modifier: Modifier = Modifier) {
    Card(
        modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
    ) {
        Column(Modifier.padding(12.dp)) {
            Text("Fasting", style = MaterialTheme.typography.labelMedium)
            if (session == null) {
                Text("No active fast", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                Text(session.protocol, style = MaterialTheme.typography.bodyMedium)
                Text(fastingElapsedLabel(session), style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Composable
fun BiofeedbackWidgetCard(entry: BiofeedbackEntryDto?, modifier: Modifier = Modifier) {
    Card(
        modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
    ) {
        Column(Modifier.padding(12.dp)) {
            Text("Biofeedback", style = MaterialTheme.typography.labelMedium)
            if (entry == null) {
                Text("No entry today", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                Text(
                    "E${entry.energy} M${entry.mood} H${entry.hunger} S${entry.stress} R${entry.soreness}",
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }
    }
}

@Composable
fun DailyQuestsWidget(modifier: Modifier = Modifier) {
    val quests = remember {
        mutableStateListOf(
            "Log 3 meals" to false,
            "Hit protein target" to false,
            "Drink 2L water" to false,
            "Complete workout" to false,
        )
    }
    Card(
        modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
    ) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("Daily quests", style = MaterialTheme.typography.labelMedium)
            quests.forEachIndexed { i, pair ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clickable { quests[i] = pair.first to !pair.second }
                        .padding(vertical = 2.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Icon(
                        imageVector = if (pair.second) Icons.Filled.CheckCircle else Icons.Outlined.Circle,
                        contentDescription = null,
                        tint = if (pair.second) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        pair.first,
                        style = MaterialTheme.typography.bodySmall,
                        textDecoration = if (pair.second) TextDecoration.LineThrough else null,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
    }
}
