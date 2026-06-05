package com.refactor.app.ui.workouts

import com.refactor.app.api.dto.FitnessPlanDto
import com.refactor.app.api.dto.WorkoutDayDto
import com.refactor.app.api.dto.WorkoutExerciseDto
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.regex.Pattern

/** Web `exerciseKey` format for `/api/data/sync` `workoutProgress`. Mirrors iOS `WorkoutWebProgress`. */
object WorkoutWebProgress {

    private val isoDate = DateTimeFormatter.ISO_LOCAL_DATE

    fun legacyKey(
        planId: String,
        dayLabel: String,
        section: String,
        exercise: WorkoutExerciseDto,
    ): String {
        val notes = exercise.notes.orEmpty()
        return if (section == "main") {
            "$planId:$dayLabel:${exercise.name}:${exercise.sets}:${exercise.reps}:$notes"
        } else {
            "$planId:$dayLabel:$section:${exercise.name}:${exercise.sets}:${exercise.reps}:$notes"
        }
    }

    fun weekScopedKey(
        planId: String,
        weekStartMondayYyyyMmDd: String,
        dayLabel: String,
        section: String,
        exercise: WorkoutExerciseDto,
    ): String {
        val notes = exercise.notes.orEmpty()
        return "$planId:$weekStartMondayYyyyMmDd:$dayLabel:$section:${exercise.name}:${exercise.sets}:${exercise.reps}:$notes"
    }

    fun localRowSetProgressKey(
        planId: String,
        dayLabel: String,
        section: String,
        exercise: WorkoutExerciseDto,
        globalSlot: Int,
    ): String = "${legacyKey(planId, dayLabel, section, exercise)}#$globalSlot"

    data class ParsedKey(
        val dayLabel: String,
        val section: String,
        val exercise: WorkoutExerciseDto,
        val weekStartMonday: String?,
    )

    fun parseKey(key: String, planId: String): ParsedKey? {
        val prefix = "$planId:"
        if (!key.startsWith(prefix)) return null
        val rest = key.drop(prefix.length)
        val parts = rest.split(':')
        if (parts.isEmpty()) return null

        val p1 = parts[0]
        val weekPattern = Pattern.compile("^\\d{4}-\\d{2}-\\d{2}$")
        if (weekPattern.matcher(p1).matches()) {
            if (parts.size < 6) return null
            val weekStart = parts[0]
            val dayLabel = parts[1]
            val section = parts[2]
            val name = parts[3]
            val sets = parts[4]
            val reps = parts[5]
            val notes = parts.drop(6).joinToString(":")
            val ex = WorkoutExerciseDto(name, sets, reps, notes.ifEmpty { null })
            return ParsedKey(dayLabel, section, ex, weekStart)
        }

        if (parts.size >= 6 && (parts[1] == "warmup" || parts[1] == "finisher")) {
            val dayLabel = parts[0]
            val section = parts[1]
            val name = parts[2]
            val sets = parts[3]
            val reps = parts[4]
            val notes = parts.drop(5).joinToString(":")
            val ex = WorkoutExerciseDto(name, sets, reps, notes.ifEmpty { null })
            return ParsedKey(dayLabel, section, ex, null)
        }

        if (parts.size < 5) return null
        val dayLabel = parts[0]
        val name = parts[1]
        val sets = parts[2]
        val reps = parts[3]
        val notes = parts.drop(4).joinToString(":")
        val ex = WorkoutExerciseDto(name, sets, reps, notes.ifEmpty { null })
        return ParsedKey(dayLabel, "main", ex, null)
    }

    fun locateSlot(parsed: ParsedKey, plan: FitnessPlanDto): Pair<Int, Int>? {
        val wp = plan.workoutPlan?.weeklyPlan.orEmpty()
        val targetDay = parsed.dayLabel.lowercase()

        val matchingDays = wp.mapIndexedNotNull { idx, day ->
            val d = day.day.lowercase()
            if (d == targetDay || d.startsWith(targetDay) || targetDay.startsWith(d)) idx to day else null
        }

        fun matchesExact(ex: WorkoutExerciseDto) =
            ex.name == parsed.exercise.name &&
                ex.sets == parsed.exercise.sets &&
                ex.reps == parsed.exercise.reps &&
                (ex.notes.orEmpty()) == (parsed.exercise.notes.orEmpty())

        for ((planIndex, day) in matchingDays) {
            for ((slot, ex) in day.enumeratedExerciseSlots()) {
                if (day.sectionForGlobalSlot(slot) != parsed.section) continue
                if (matchesExact(ex)) return planIndex to slot
            }
        }

        val parsedName = parsed.exercise.name.lowercase()
        for ((planIndex, day) in matchingDays) {
            for ((slot, ex) in day.enumeratedExerciseSlots()) {
                if (day.sectionForGlobalSlot(slot) != parsed.section) continue
                if (ex.name.lowercase() == parsedName) return planIndex to slot
            }
        }
        return null
    }

    fun calendarDayKey(weekStartMonday: String, dayLabel: String, fallbackUtcDate: String): String {
        val offsets = mapOf(
            "monday" to 0, "mon" to 0,
            "tuesday" to 1, "tue" to 1,
            "wednesday" to 2, "wed" to 2,
            "thursday" to 3, "thu" to 3,
            "friday" to 4, "fri" to 4,
            "saturday" to 5, "sat" to 5,
            "sunday" to 6, "sun" to 6,
        )
        val lower = dayLabel.lowercase()
        val offset = offsets.entries.firstOrNull { (k, _) -> lower.startsWith(k) }?.value ?: return fallbackUtcDate
        val monday = runCatching { LocalDate.parse(weekStartMonday, isoDate) }.getOrNull() ?: return fallbackUtcDate
        return monday.plusDays(offset.toLong()).format(isoDate)
    }
}
