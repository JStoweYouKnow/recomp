package com.refactor.app.ui.dashboard

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.outlined.Bolt
import androidx.compose.material.icons.outlined.Circle
import androidx.compose.material.icons.outlined.FitnessCenter
import androidx.compose.material.icons.outlined.Psychology
import androidx.compose.material.icons.outlined.SentimentNeutral
import androidx.compose.material.icons.outlined.SentimentSatisfied
import androidx.compose.material.icons.outlined.Timer
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.refactor.app.api.dto.BiofeedbackEntryDto
import com.refactor.app.api.dto.FastingSessionDto
import com.refactor.app.api.dto.HydrationEntryDto
import com.refactor.app.api.dto.MealEntryDto
import com.refactor.app.api.dto.MealMacrosDto
import com.refactor.app.api.dto.MetabolicModelDto
import com.refactor.app.api.dto.UserProfileDto
import com.refactor.app.api.dto.WorkoutDayDto
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlinx.coroutines.delay

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
    var c = 0.0; var p = 0.0; var cb = 0.0; var f = 0.0
    meals?.filter { it.date == date }?.forEach { m ->
        val computedCal = m.macros.protein * 4 + m.macros.carbs * 4 + m.macros.fat * 9
        c += if (m.macros.calories > 0) m.macros.calories else computedCal
        p += m.macros.protein; cb += m.macros.carbs; f += m.macros.fat
    }
    return MealMacrosDto(c, p, cb, f)
}

fun activityCalorieAdjustmentForDate(log: List<com.refactor.app.api.dto.ActivityLogEntryDto>?, date: String): Int =
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

// ─── Avatar ─────────────────────────────────────────────────────────────────

@Composable
fun AvatarCircle(name: String, size: Dp = 40.dp) {
    val initials = name.trim().split(" ")
        .take(2).mapNotNull { it.firstOrNull()?.uppercaseChar() }
        .joinToString("")
        .ifEmpty { "?" }
    val color = MaterialTheme.colorScheme.primaryContainer
    val onColor = MaterialTheme.colorScheme.onPrimaryContainer
    Box(
        Modifier
            .size(size)
            .clip(CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.matchParentSize()) { drawRect(color = color) }
        Text(
            initials,
            style = MaterialTheme.typography.labelMedium.copy(
                fontWeight = FontWeight.Bold,
                fontSize = (size.value * 0.35).sp,
            ),
            color = onColor,
        )
    }
}

// ─── Calorie Budget ──────────────────────────────────────────────────────────

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
    val progress = min(consumed.toDouble() / max(target, 1).toDouble(), 1.0).toFloat()
    val animatedProgress by animateFloatAsState(targetValue = progress, animationSpec = tween(600), label = "cal")
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Column {
                    Text(
                        if (over) "OVER BUDGET" else "REMAINING",
                        style = MaterialTheme.typography.labelSmall,
                        color = if (over) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                        letterSpacing = 0.5.sp,
                    )
                    Text(
                        if (over) "+${consumed - target}" else "$remaining",
                        style = MaterialTheme.typography.displaySmall.copy(fontWeight = FontWeight.Black),
                        color = if (over) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
                    )
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        "${(progress * 100).roundToInt()}%",
                        style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                        color = if (progress > 0.9f) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.primary,
                    )
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
                progress = { animatedProgress },
                modifier = Modifier.fillMaxWidth().height(10.dp),
                color = if (progress > 0.9f) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.primary,
            )
        }
    }
}

// ─── Macro Rings + Detail Modal ──────────────────────────────────────────────

private data class MacroItem(
    val label: String,
    val current: Double,
    val target: Double,
    val unit: String,
    val color: Color,
) {
    val progress get() = if (target > 0) (current / target).coerceIn(0.0, 1.0).toFloat() else 0f
    val pct get() = (progress * 100).roundToInt()
    val remaining get() = maxOf(target - current, 0.0)
    val overBy get() = maxOf(current - target, 0.0)
    val isOver get() = current > target && target > 0
}

@Composable
private fun MacroRing(item: MacroItem, onClick: () -> Unit) {
    val animProgress by animateFloatAsState(
        targetValue = item.progress,
        animationSpec = tween(400),
        label = "ring_${item.label}",
    )
    val errorColor = MaterialTheme.colorScheme.error
    val trackColor = item.color.copy(alpha = 0.15f)
    val fillColor = if (item.isOver) errorColor else item.color
    val textColor = if (item.isOver) errorColor else MaterialTheme.colorScheme.onSurface

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.clickable(onClick = onClick),
    ) {
        Box(contentAlignment = Alignment.Center, modifier = Modifier.size(70.dp)) {
            Canvas(Modifier.size(70.dp)) {
                val stroke = 7.dp.toPx()
                val inset = stroke / 2f
                val arcSize = Size(size.width - stroke, size.height - stroke)
                val topLeft = Offset(inset, inset)
                drawArc(color = trackColor, startAngle = -90f, sweepAngle = 360f, useCenter = false,
                    topLeft = topLeft, size = arcSize, style = Stroke(stroke, cap = StrokeCap.Round))
                if (animProgress > 0f)
                    drawArc(color = fillColor, startAngle = -90f, sweepAngle = 360f * animProgress, useCenter = false,
                        topLeft = topLeft, size = arcSize, style = Stroke(stroke, cap = StrokeCap.Round))
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    item.current.roundToInt().toString(),
                    style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold),
                    color = textColor,
                )
                Text(item.unit, fontSize = 9.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Spacer(Modifier.height(4.dp))
        Text(item.label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun MacroDetailDialog(item: MacroItem, onDismiss: () -> Unit) {
    val errorColor = MaterialTheme.colorScheme.error
    val fillColor = if (item.isOver) errorColor else item.color
    AlertDialog(
        onDismissRequest = onDismiss,
        title = null,
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Box(contentAlignment = Alignment.Center, modifier = Modifier.size(48.dp)) {
                        Canvas(Modifier.size(48.dp)) {
                            val stroke = 5.dp.toPx()
                            val inset = stroke / 2f
                            val arcSize = Size(size.width - stroke, size.height - stroke)
                            val topLeft = Offset(inset, inset)
                            drawArc(color = item.color.copy(alpha = 0.2f), startAngle = -90f, sweepAngle = 360f,
                                useCenter = false, topLeft = topLeft, size = arcSize, style = Stroke(stroke, cap = StrokeCap.Round))
                            if (item.progress > 0f)
                                drawArc(color = fillColor, startAngle = -90f, sweepAngle = 360f * item.progress,
                                    useCenter = false, topLeft = topLeft, size = arcSize, style = Stroke(stroke, cap = StrokeCap.Round))
                        }
                    }
                    Column {
                        Text(item.label, style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold))
                        Text(
                            if (item.isOver) "Over target" else "${item.pct}% of daily goal",
                            style = MaterialTheme.typography.bodySmall,
                            color = if (item.isOver) errorColor else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                HorizontalDivider()
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly,
                    verticalAlignment = Alignment.CenterVertically) {
                    MacroStatCell("CONSUMED", item.current, item.unit, fillColor)
                    VerticalDivider(Modifier.height(44.dp))
                    MacroStatCell("TARGET", item.target, item.unit, MaterialTheme.colorScheme.onSurfaceVariant)
                    VerticalDivider(Modifier.height(44.dp))
                    if (item.isOver)
                        MacroStatCell("OVER BY", item.overBy, item.unit, errorColor)
                    else
                        MacroStatCell("REMAINING", item.remaining, item.unit, Color(0xFF4CAF50))
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Done") } },
    )
}

@Composable
private fun MacroStatCell(title: String, value: Double, unit: String, color: Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(title, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                if (value >= 10) value.roundToInt().toString() else String.format("%.1f", value),
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Black),
                color = color,
            )
            Text(unit, style = MaterialTheme.typography.labelSmall, color = color.copy(alpha = 0.7f))
        }
    }
}

@Composable
fun MacroPillsRow(consumed: MealMacrosDto, targets: MealMacrosDto, modifier: Modifier = Modifier) {
    val primary = MaterialTheme.colorScheme.primary
    val items = listOf(
        MacroItem("Cal", consumed.calories, targets.calories, "kcal", Color(0xFFE8A045)),
        MacroItem("Protein", consumed.protein, targets.protein, "g", primary),
        MacroItem("Carbs", consumed.carbs, targets.carbs, "g", Color(0xFF7DA86B)),
        MacroItem("Fat", consumed.fat, targets.fat, "g", Color(0xFFB5613E)),
    )
    var selected by remember { mutableStateOf<MacroItem?>(null) }
    Row(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
        items.forEach { item -> MacroRing(item) { selected = item } }
    }
    selected?.let { MacroDetailDialog(it) { selected = null } }
}

// ─── Workout Card ────────────────────────────────────────────────────────────

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
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.primaryContainer,
                modifier = Modifier.size(48.dp),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        Icons.Outlined.FitnessCenter,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onPrimaryContainer,
                        modifier = Modifier.size(26.dp),
                    )
                }
            }
            Column(Modifier.weight(1f)) {
                Text(
                    "TODAY'S WORKOUT",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.primary,
                    letterSpacing = 1.sp,
                )
                Text(day.day, style = MaterialTheme.typography.titleMedium)
                Text(day.focus, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    "$slots",
                    style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.Black),
                    color = MaterialTheme.colorScheme.primary,
                )
                Text("exercises", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

// ─── Adaptive TDEE Card ──────────────────────────────────────────────────────

fun estimateTdee(profile: UserProfileDto): Int? {
    val weightKg = profile.weight.takeIf { it > 0 }?.div(2.2046) ?: return null
    val height = profile.height.takeIf { it > 0 } ?: return null
    val age = profile.age.takeIf { it > 0 } ?: return null
    val bmr = when (profile.gender.lowercase()) {
        "male" -> 10 * weightKg + 6.25 * height - 5 * age + 5
        "female" -> 10 * weightKg + 6.25 * height - 5 * age - 161
        else -> 10 * weightKg + 6.25 * height - 5 * age - 78
    }
    val multiplier = when (profile.dailyActivityLevel?.lowercase()) {
        "sedentary" -> 1.2
        "light", "lightly_active" -> 1.375
        "active", "moderately_active" -> 1.55
        "very_active" -> 1.725
        "extra_active" -> 1.9
        else -> 1.55
    }
    return (bmr * multiplier).roundToInt()
}

@Composable
fun AdaptiveTdeeCard(profile: UserProfileDto, metabolicModel: MetabolicModelDto?, modifier: Modifier = Modifier) {
    val formulaTdee = remember(profile) { estimateTdee(profile) }
    val tdee = metabolicModel?.estimatedTDEE?.takeIf { it > 0 } ?: formulaTdee
    val isModelBased = metabolicModel?.estimatedTDEE?.let { it > 0 } == true
    Card(
        modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Outlined.Bolt, contentDescription = null, modifier = Modifier.size(16.dp), tint = MaterialTheme.colorScheme.primary)
                Text("Adaptive TDEE", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            }
            if (tdee != null) {
                Text(
                    "$tdee kcal/day",
                    style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Bold),
                    color = MaterialTheme.colorScheme.primary,
                )
                if (isModelBased) {
                    Text(
                        "Last estimate · ${metabolicModel!!.confidence}% confidence (${metabolicModel.dataPoints.size} pts)",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                } else {
                    Text(
                        "Formula estimate based on your profile. Log meals + weight data to refine.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            } else {
                Text(
                    "Complete your profile (weight, height, age) to see your estimated metabolism.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

// ─── Coach Check-In Card ──────────────────────────────────────────────────────

@Composable
fun CoachCheckInCard(
    message: String?,
    loading: Boolean,
    onFetch: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Outlined.Psychology, contentDescription = null, modifier = Modifier.size(16.dp), tint = MaterialTheme.colorScheme.primary)
                Text("Ref Check-In", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            }
            if (message != null) {
                Text(message, style = MaterialTheme.typography.bodyMedium)
            } else {
                Text(
                    "Get a personalized nudge based on today's meals, biofeedback, streak, and workout.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Button(
                onClick = onFetch,
                enabled = !loading,
                modifier = Modifier,
            ) {
                if (loading) {
                    CircularProgressIndicator(Modifier.size(14.dp), strokeWidth = 2.dp)
                    Spacer(Modifier.width(6.dp))
                }
                Text(if (message != null) "Refresh check-in" else "Get check-in")
            }
        }
    }
}

// ─── Hydration Widget ────────────────────────────────────────────────────────

@Composable
fun HydrationWidgetCard(
    ml: Double,
    onAdd: (Int) -> Unit,
    onRemove: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val goalMl = 2500
    val progress = (ml / goalMl).toFloat().coerceIn(0f, 1f)
    val trackColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.15f)
    val fillColor = MaterialTheme.colorScheme.primary

    Card(modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow)) {
        Column(Modifier.padding(12.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Hydration", style = MaterialTheme.typography.labelMedium)
            Box(Modifier.size(56.dp), contentAlignment = Alignment.Center) {
                Canvas(Modifier.size(56.dp)) {
                    val stroke = Stroke(width = 5.dp.toPx(), cap = StrokeCap.Round)
                    val inset = 2.5.dp.toPx()
                    val rect = Size(size.width - inset * 2, size.height - inset * 2)
                    drawArc(color = trackColor, startAngle = -90f, sweepAngle = 360f, useCenter = false, topLeft = Offset(inset, inset), size = rect, style = stroke)
                    drawArc(color = fillColor, startAngle = -90f, sweepAngle = 360f * progress, useCenter = false, topLeft = Offset(inset, inset), size = rect, style = stroke)
                }
                Text(
                    if (ml >= 1000) "%.1fL".format(ml / 1000.0) else "${ml.roundToInt()}",
                    style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold, fontSize = 10.sp),
                )
            }
            Text("${ml.roundToInt()} / $goalMl ml", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                HydroButton("-250", enabled = ml >= 250) { onRemove(250) }
                HydroButton("+250") { onAdd(250) }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                HydroButton("-500", enabled = ml >= 500) { onRemove(500) }
                HydroButton("+500") { onAdd(500) }
            }
        }
    }
}

@Composable
private fun HydroButton(label: String, enabled: Boolean = true, onClick: () -> Unit) {
    val isRemove = label.startsWith("-")
    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        colors = ButtonDefaults.outlinedButtonColors(
            contentColor = if (isRemove) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
        ),
        modifier = Modifier.height(28.dp),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 8.dp, vertical = 0.dp),
    ) {
        Text(label, style = MaterialTheme.typography.labelSmall)
    }
}

// ─── Fasting Widget ──────────────────────────────────────────────────────────

@Composable
fun FastingWidgetCard(
    session: FastingSessionDto?,
    onStart: () -> Unit,
    onEnd: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var tickSeconds by remember { mutableIntStateOf(0) }
    LaunchedEffect(session?.startTime) {
        if (session == null) return@LaunchedEffect
        while (true) { delay(1000); tickSeconds++ }
    }

    val trackColor = MaterialTheme.colorScheme.secondary.copy(alpha = 0.15f)
    val fillColor = MaterialTheme.colorScheme.secondary

    Card(modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow)) {
        Column(Modifier.padding(12.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Fasting", style = MaterialTheme.typography.labelMedium)
            if (session != null) {
                val startInstant = runCatching { Instant.parse(session.startTime) }.getOrNull()
                val elapsedHours = startInstant?.let {
                    @Suppress("UNUSED_EXPRESSION") tickSeconds
                    ChronoUnit.MINUTES.between(it, Instant.now()) / 60.0
                } ?: 0.0
                val progress = (elapsedHours / session.targetHours).toFloat().coerceIn(0f, 1f)

                Box(Modifier.size(56.dp), contentAlignment = Alignment.Center) {
                    Canvas(Modifier.size(56.dp)) {
                        val stroke = Stroke(width = 5.dp.toPx(), cap = StrokeCap.Round)
                        val inset = 2.5.dp.toPx()
                        val rect = Size(size.width - inset * 2, size.height - inset * 2)
                        drawArc(color = trackColor, startAngle = -90f, sweepAngle = 360f, useCenter = false, topLeft = Offset(inset, inset), size = rect, style = stroke)
                        drawArc(color = fillColor, startAngle = -90f, sweepAngle = 360f * progress, useCenter = false, topLeft = Offset(inset, inset), size = rect, style = stroke)
                    }
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("%.1f".format(elapsedHours), style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold, fontSize = 9.sp))
                        Text("hrs", style = MaterialTheme.typography.labelSmall.copy(fontSize = 7.sp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                Text(session.protocol, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.secondary)
                OutlinedButton(
                    onClick = onEnd,
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.secondary),
                    modifier = Modifier.height(30.dp),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp, vertical = 0.dp),
                ) { Text("End Fast", style = MaterialTheme.typography.labelSmall) }
            } else {
                Icon(Icons.Outlined.Timer, contentDescription = null, modifier = Modifier.size(32.dp), tint = MaterialTheme.colorScheme.secondary)
                Text("No active fast", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Button(
                    onClick = onStart,
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.secondary),
                    modifier = Modifier.height(30.dp),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp, vertical = 0.dp),
                ) { Text("Start Fast", style = MaterialTheme.typography.labelSmall) }
            }
        }
    }
}

// ─── Biofeedback Widget ──────────────────────────────────────────────────────

@Composable
fun BiofeedbackWidgetCard(
    existingEntry: BiofeedbackEntryDto?,
    onLog: (energy: Int, mood: Int, hunger: Int, stress: Int, soreness: Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    var hasLogged by rememberSaveable(existingEntry) { mutableStateOf(existingEntry != null) }
    var energy by rememberSaveable { mutableIntStateOf(existingEntry?.energy ?: 3) }
    var mood by rememberSaveable { mutableIntStateOf(existingEntry?.mood ?: 3) }
    var hunger by rememberSaveable { mutableIntStateOf(existingEntry?.hunger ?: 3) }
    var stress by rememberSaveable { mutableIntStateOf(existingEntry?.stress ?: 3) }
    var soreness by rememberSaveable { mutableIntStateOf(existingEntry?.soreness ?: 3) }

    Card(modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow)) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("Biofeedback", style = MaterialTheme.typography.labelMedium)
            if (hasLogged) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                    Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(24.dp))
                    Text("Logged today", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    OutlinedButton(
                        onClick = { hasLogged = false },
                        modifier = Modifier.height(28.dp),
                        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 8.dp, vertical = 0.dp),
                    ) { Text("Update", style = MaterialTheme.typography.labelSmall) }
                }
            } else {
                BioMetricRow("Energy", energy, Icons.Outlined.Bolt, MaterialTheme.colorScheme.tertiary) { energy = it }
                BioMetricRow("Mood", mood, Icons.Outlined.SentimentSatisfied, MaterialTheme.colorScheme.primary) { mood = it }
                BioMetricRow("Hunger", hunger, Icons.Outlined.SentimentNeutral, MaterialTheme.colorScheme.secondary) { hunger = it }
                BioMetricRow("Stress", stress, Icons.Outlined.Psychology, MaterialTheme.colorScheme.error) { stress = it }
                BioMetricRow("Sore", soreness, Icons.Outlined.FitnessCenter, MaterialTheme.colorScheme.outline) { soreness = it }
                Button(
                    onClick = {
                        onLog(energy, mood, hunger, stress, soreness)
                        hasLogged = true
                    },
                    modifier = Modifier.fillMaxWidth().height(32.dp),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp, vertical = 0.dp),
                ) { Text("Log", style = MaterialTheme.typography.labelMedium) }
            }
        }
    }
}

@Composable
private fun BioMetricRow(label: String, value: Int, icon: ImageVector, color: Color, onValueChange: (Int) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(10.dp), tint = color)
            Text(label, style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.sp), color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(3.dp)) {
            (1..5).forEach { i ->
                Box(
                    Modifier
                        .weight(1f)
                        .height(10.dp)
                        .clip(RoundedCornerShape(2.dp))
                        .clickable { onValueChange(i) },
                ) {
                    Canvas(Modifier.matchParentSize()) {
                        drawRect(color = if (i <= value) color else color.copy(alpha = 0.12f))
                    }
                }
            }
        }
    }
}

// ─── Daily Quests Widget ─────────────────────────────────────────────────────

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
    Card(modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow)) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("Daily Quests", style = MaterialTheme.typography.labelMedium)
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
                        modifier = Modifier.size(16.dp),
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
