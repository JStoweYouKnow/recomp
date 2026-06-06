package com.refactor.app.prefs

import android.content.Context

/** Local coach check-in schedule — parity with iOS `@AppStorage("coachScheduleTimes")`. */
class CoachSchedulePrefs(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun timesRaw(): String = prefs.getString(KEY_TIMES, DEFAULT_TIMES) ?: DEFAULT_TIMES
    fun weeklyReviewDay(): Int = prefs.getInt(KEY_WEEKLY_DAY, 0)

    fun setTimesRaw(value: String) = prefs.edit().putString(KEY_TIMES, value).apply()
    fun setWeeklyReviewDay(day: Int) = prefs.edit().putInt(KEY_WEEKLY_DAY, day).apply()

    companion object {
        private const val PREFS = "refactor_coach_schedule"
        private const val KEY_TIMES = "coach_schedule_times"
        private const val KEY_WEEKLY_DAY = "coach_schedule_weekly_review_day"
        private const val DEFAULT_TIMES = "08:00 12:00 20:00"
    }
}
