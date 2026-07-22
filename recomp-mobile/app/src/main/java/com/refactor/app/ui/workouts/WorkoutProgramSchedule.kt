package com.refactor.app.ui.workouts

import com.refactor.app.api.dto.FitnessPlanDto
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.time.temporal.TemporalAdjusters

/** Matches web / iOS `WorkoutProgramSchedule`. */
object WorkoutProgramSchedule {

    private val isoDate = DateTimeFormatter.ISO_LOCAL_DATE

    fun mondayWeekStartContaining(date: LocalDate): LocalDate =
        date.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))

    fun mondayWeekStartStringContaining(yyyyMmDd: String): String =
        runCatching {
            val d = LocalDate.parse(yyyyMmDd, isoDate)
            mondayWeekStartContaining(d).format(isoDate)
        }.getOrElse { yyyyMmDd }

    fun mondayWeeksElapsed(anchorMonday: LocalDate, otherMonday: LocalDate): Int {
        val days = ChronoUnit.DAYS.between(anchorMonday, otherMonday).toInt()
        return days / 7
    }

    fun extractProgramWeek(dayLabel: String): Int? {
        val lower = dayLabel.lowercase()
        val idx = lower.indexOf("week")
        if (idx < 0) return null
        val tail = lower.substring(idx + 4).dropWhile { it == ' ' || it == ':' }
        val num = buildString { tail.forEach { if (it.isDigit()) append(it) } }
        return num.toIntOrNull()
    }

    private fun weekdayMatches(planDay: String, dayName: String, shortName: String): Boolean {
        val p = planDay.lowercase()
        return p == dayName || p == shortName || p.startsWith(dayName) || p.startsWith(shortName)
    }

    fun planIndexForDate(plan: FitnessPlanDto, date: LocalDate): Int? {
        val wp = plan.workoutPlan?.weeklyPlan.orEmpty()
        if (wp.isEmpty()) return null

        val (dayName, shortName) = when (date.dayOfWeek) {
            DayOfWeek.SUNDAY -> "sunday" to "sun"
            DayOfWeek.MONDAY -> "monday" to "mon"
            DayOfWeek.TUESDAY -> "tuesday" to "tue"
            DayOfWeek.WEDNESDAY -> "wednesday" to "wed"
            DayOfWeek.THURSDAY -> "thursday" to "thu"
            DayOfWeek.FRIDAY -> "friday" to "fri"
            DayOfWeek.SATURDAY -> "saturday" to "sat"
        }

        if (wp.size > 7) {
            val anchorStr = plan.workoutPlan?.programWeek1Start
            if (!anchorStr.isNullOrBlank()) {
                val anchorDay = runCatching { LocalDate.parse(anchorStr, isoDate) }.getOrNull()
                if (anchorDay != null) {
                    val selectedMonday = mondayWeekStartContaining(date)
                    val anchorMonday = mondayWeekStartContaining(anchorDay)
                    val programWeek = mondayWeeksElapsed(anchorMonday, selectedMonday) + 1
                    if (programWeek >= 1) {
                        for (i in wp.indices) {
                            val pd = wp[i].day.lowercase()
                            if (!weekdayMatches(pd, dayName, shortName)) continue
                            val wn = extractProgramWeek(wp[i].day)
                            if (wn == programWeek) return i
                        }
                    }
                    return null
                }
            }
            for (i in wp.indices) {
                val pd = wp[i].day.lowercase()
                if (!weekdayMatches(pd, dayName, shortName)) continue
                val wn = extractProgramWeek(wp[i].day)
                if (wn == 1) return i
            }
            return null
        }

        for (i in wp.indices) {
            if (weekdayMatches(wp[i].day.lowercase(), dayName, shortName)) return i
        }

        if (!planUsesNamedWeekdays(wp)) {
            val mondayBased = when (date.dayOfWeek) {
                DayOfWeek.MONDAY -> 0
                DayOfWeek.TUESDAY -> 1
                DayOfWeek.WEDNESDAY -> 2
                DayOfWeek.THURSDAY -> 3
                DayOfWeek.FRIDAY -> 4
                DayOfWeek.SATURDAY -> 5
                DayOfWeek.SUNDAY -> 6
            }
            if (mondayBased < wp.size) return mondayBased
        }
        return null
    }

    private fun planUsesNamedWeekdays(weeklyPlan: List<com.refactor.app.api.dto.WorkoutDayDto>): Boolean {
        val names = listOf("sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday")
        val shorts = listOf("sun", "mon", "tue", "wed", "thu", "fri", "sat")
        return weeklyPlan.any { day ->
            val p = day.day.lowercase()
            names.any { p.startsWith(it) } || shorts.any { p.startsWith(it) }
        }
    }

    fun progressDayKeyForWorkoutDay(workoutDayLabel: String, weekContaining: LocalDate): String {
        val sunday = weekContaining.with(TemporalAdjusters.previousOrSame(DayOfWeek.SUNDAY))
        val offset = weekdayOffsetFromSunday(workoutDayLabel)
        return sunday.plusDays(offset.toLong()).format(isoDate)
    }

    private fun weekdayOffsetFromSunday(dayLabel: String): Int {
        val l = dayLabel.lowercase()
        return when {
            l.startsWith("sunday") -> 0
            l.startsWith("monday") -> 1
            l.startsWith("tuesday") -> 2
            l.startsWith("wednesday") -> 3
            l.startsWith("thursday") -> 4
            l.startsWith("friday") -> 5
            l.startsWith("saturday") -> 6
            else -> 0
        }
    }
}
