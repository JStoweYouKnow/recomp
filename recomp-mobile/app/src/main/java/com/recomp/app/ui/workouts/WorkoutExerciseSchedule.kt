package com.recomp.app.ui.workouts

import com.recomp.app.api.dto.WorkoutDayDto
import com.recomp.app.api.dto.WorkoutExerciseDto
import java.util.regex.Pattern

/** Mirrors iOS `WorkoutExercise.parseSetCount` / `effectiveSetCount`. */
fun WorkoutExerciseDto.effectiveSetCount(): Int = parseSetCountFromSetsString(sets)

fun parseSetCountFromSetsString(raw: String, defaultCount: Int = 3, maxSets: Int = 12): Int {
    val s = raw.trim()
    if (s.isEmpty()) return defaultCount
    fun clamp(n: Int) = n.coerceIn(1, maxSets)
    val lowered = s.lowercase()

    firstCaptureInt("""^\s*(\d+)\s*sets?\s*of\s*(\d+)""", lowered, 1)?.let { return clamp(it) }
    firstCaptureInt("""(\d+)\s*[x×]\s*(\d+)""", lowered, 1)?.let { return clamp(it) }

    val normalized = s.replace('–', '-')
    val dashParts = normalized.split('-').map { it.trim() }.filter { it.isNotEmpty() }
    if (dashParts.size >= 2) {
        val a = dashParts[0].toIntOrNull()
        val bDigits = dashParts[1].takeWhile { it.isDigit() }
        val b = bDigits.toIntOrNull()
        if (a != null && b != null) return clamp(maxOf(a, b))
    }

    s.toIntOrNull()?.let { return clamp(it) }

    val m = Pattern.compile("""\d+""").matcher(s)
    if (m.find()) {
        return clamp(m.group().toInt())
    }
    return defaultCount
}

private fun firstCaptureInt(pattern: String, string: String, group: Int): Int? {
    val re = Pattern.compile(pattern, Pattern.CASE_INSENSITIVE)
    val m = re.matcher(string)
    if (!m.find() || group > m.groupCount()) return null
    return m.group(group)?.toIntOrNull()
}

/** Flat order: warm-ups, main, finishers — matches web / iOS. */
fun WorkoutDayDto.enumeratedExerciseSlots(): List<Pair<Int, WorkoutExerciseDto>> {
    val out = ArrayList<Pair<Int, WorkoutExerciseDto>>()
    var i = 0
    warmups?.forEach { ex ->
        out.add(i to ex)
        i++
    }
    exercises.forEach { ex ->
        out.add(i to ex)
        i++
    }
    finishers?.forEach { ex ->
        out.add(i to ex)
        i++
    }
    return out
}

fun WorkoutDayDto.sectionForGlobalSlot(globalSlot: Int): String {
    val w = warmups?.size ?: 0
    val m = exercises.size
    return when {
        globalSlot < w -> "warmup"
        globalSlot < w + m -> "main"
        else -> "finisher"
    }
}
