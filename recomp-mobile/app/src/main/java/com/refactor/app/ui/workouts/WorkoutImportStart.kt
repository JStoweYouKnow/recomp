package com.refactor.app.ui.workouts

import com.refactor.app.api.dto.WorkoutDayDto
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.TemporalAdjusters
import java.util.Locale
import java.util.regex.Pattern

/** Matches web `workout-import-start.ts`. */
object WorkoutImportStart {
    private val isoDate = DateTimeFormatter.ISO_LOCAL_DATE
    private val weekdayNames = listOf("sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday")
    private val shortNames = listOf("sun", "mon", "tue", "wed", "thu", "fri", "sat")
    private val weekPattern = Pattern.compile("week\\s*(\\d+)", Pattern.CASE_INSENSITIVE)

    /** 0 = Sunday … 6 = Saturday (matches JavaScript `Date.getDay()`). */
    fun weekdayIndex(dayLabel: String): Int? {
        val lower = dayLabel.trim().lowercase(Locale.US)
        weekdayNames.forEachIndexed { i, name ->
            if (lower == name || lower.startsWith("$name ") || lower.startsWith(shortNames[i])) return i
        }
        return null
    }

    fun extractProgramWeek(dayLabel: String): Int? {
        val m = weekPattern.matcher(dayLabel)
        return if (m.find()) m.group(1)?.toIntOrNull() else null
    }

    fun isAnchoredProgram(weeklyPlan: List<WorkoutDayDto>): Boolean =
        weeklyPlan.size > 7 || weeklyPlan.any { extractProgramWeek(it.day) != null }

    fun nextOccurrenceOfWeekday(weekdayIndex: Int, today: LocalDate = LocalDate.now()): LocalDate {
        val todayDow = today.dayOfWeek.value % 7 // Sun=0 … Sat=6
        val daysUntil = (weekdayIndex - todayDow + 7) % 7
        return today.plusDays(daysUntil.toLong())
    }

    fun inferFirstSessionDate(weeklyPlan: List<WorkoutDayDto>, today: LocalDate = LocalDate.now()): LocalDate {
        val first = weeklyPlan.firstOrNull { it.day.isNotBlank() } ?: return nextOccurrenceOfWeekday(1, today)
        val wd = weekdayIndex(first.day) ?: return nextOccurrenceOfWeekday(1, today)
        return nextOccurrenceOfWeekday(wd, today)
    }

    fun inferProgramWeek1Start(weeklyPlan: List<WorkoutDayDto>, today: LocalDate = LocalDate.now()): String? {
        if (weeklyPlan.isEmpty() || !isAnchoredProgram(weeklyPlan)) return null
        val firstSession = inferFirstSessionDate(weeklyPlan, today)
        val monday = firstSession.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
        return monday.format(isoDate)
    }
}
