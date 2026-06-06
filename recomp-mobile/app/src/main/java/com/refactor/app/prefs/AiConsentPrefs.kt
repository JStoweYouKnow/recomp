package com.refactor.app.prefs

import android.content.Context

/** Mirrors iOS `@AppStorage("aiCoachConsentGiven")`. */
class AiConsentPrefs(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun isGiven(): Boolean = prefs.getBoolean(KEY, false)

    fun setGiven(value: Boolean) {
        prefs.edit().putBoolean(KEY, value).apply()
    }

    companion object {
        private const val PREFS = "refactor_ai_consent"
        private const val KEY = "ai_coach_consent_given"
    }
}
