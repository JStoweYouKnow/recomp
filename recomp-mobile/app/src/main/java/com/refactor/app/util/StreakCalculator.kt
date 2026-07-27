package com.refactor.app.util

import java.time.LocalDate

/** Consecutive-day logging streak. Mirrors iOS `DateHelpers.streakLength`. */
object StreakCalculator {
    /** Number of consecutive days up to today present in [dates] (yyyy-MM-dd strings). */
    fun streakLength(dates: Collection<String>): Int {
        val set = dates.toHashSet()
        var streak = 0
        var day = LocalDate.now()
        while (set.contains(day.toString())) {
            streak++
            day = day.minusDays(1)
        }
        return streak
    }
}
