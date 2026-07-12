package com.refactor.app.ui.workouts

import com.refactor.app.api.dto.WorkoutExerciseDto
import java.util.regex.Pattern

/** Mirrors iOS `WorkoutExercise.parseRestSeconds` / web `parseRest`. */
fun WorkoutExerciseDto.restSeconds(defaultSeconds: Int = 60): Int =
    parseRestSeconds(notes, defaultSeconds)

fun WorkoutExerciseDto.restDisplayLabel(): String? =
    parseRestComponents(notes)?.let { (value, unit) ->
        if (unit != null && (unit.startsWith("min") || unit == "m")) "$value min" else "${value}s"
    }

fun parseRestSeconds(notes: String?, defaultSeconds: Int = 60): Int {
    val parts = parseRestComponents(notes) ?: return defaultSeconds
    return toSeconds(parts.first, parts.second)
}

private fun parseRestComponents(notes: String?): Pair<Int, String?>? {
    val trimmed = notes?.trim().orEmpty()
    if (trimmed.isEmpty()) return null
    val lowered = trimmed.lowercase()
    val patterns = listOf(
        """rest[:\s]+(\d+)(?:\s*[-–]\s*\d+)?\s*(sec(?:onds?)?|s|min(?:utes?)?|m)?""" to 1,
        """(\d+)(?:\s*[-–]\s*\d+)?\s*(sec(?:onds?)?|s|min(?:utes?)?|m)\s+rest""" to 1,
        """^(\d+)\s*s(?:ec(?:onds?)?)?$""" to 1,
    )
    for ((pattern, group) in patterns) {
        val re = Pattern.compile(pattern, Pattern.CASE_INSENSITIVE)
        val m = re.matcher(lowered)
        if (m.find()) {
            val value = m.group(group)?.toIntOrNull() ?: continue
            val unit = if (group + 1 <= m.groupCount()) m.group(group + 1) else null
            return value to unit?.trim()?.takeIf { it.isNotEmpty() }
        }
    }
    return null
}

private fun toSeconds(value: Int, unit: String?): Int {
    if (unit == null) return value
    return if (unit.startsWith("min") || unit == "m") value * 60 else value
}

data class RestTimerState(
    val exerciseName: String,
    val endEpochMs: Long,
    val totalSeconds: Int,
) {
    fun remainingSeconds(nowMs: Long = System.currentTimeMillis()): Int =
        ((endEpochMs - nowMs) / 1000L).toInt().coerceAtLeast(0)

    fun extend(bySeconds: Int): RestTimerState = copy(
        endEpochMs = endEpochMs + bySeconds * 1000L,
        totalSeconds = totalSeconds + bySeconds,
    )
}
