package com.refactor.app.prefs

import android.content.Context

/** Local reminder toggles — parity with iOS `PushNotificationSettings` AppStorage keys. */
class NotificationPrefs(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun mealReminders(): Boolean = prefs.getBoolean(KEY_MEAL, true)
    fun workoutReminders(): Boolean = prefs.getBoolean(KEY_WORKOUT, true)
    fun hydrationReminders(): Boolean = prefs.getBoolean(KEY_HYDRATION, false)
    fun coachCheckIns(): Boolean = prefs.getBoolean(KEY_COACH, true)

    fun setMealReminders(on: Boolean) = prefs.edit().putBoolean(KEY_MEAL, on).apply()
    fun setWorkoutReminders(on: Boolean) = prefs.edit().putBoolean(KEY_WORKOUT, on).apply()
    fun setHydrationReminders(on: Boolean) = prefs.edit().putBoolean(KEY_HYDRATION, on).apply()
    fun setCoachCheckIns(on: Boolean) = prefs.edit().putBoolean(KEY_COACH, on).apply()

    companion object {
        private const val PREFS = "refactor_notification_prefs"
        private const val KEY_MEAL = "notif_meal"
        private const val KEY_WORKOUT = "notif_workout"
        private const val KEY_HYDRATION = "notif_hydration"
        private const val KEY_COACH = "notif_coach"
    }
}
