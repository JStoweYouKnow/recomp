package com.refactor.app.prefs

import android.content.Context

enum class AppTheme { SYSTEM, LIGHT, DARK }

class ThemePrefs(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun getTheme(): AppTheme = when (prefs.getString(KEY_THEME, "SYSTEM")) {
        "LIGHT" -> AppTheme.LIGHT
        "DARK" -> AppTheme.DARK
        else -> AppTheme.SYSTEM
    }

    fun setTheme(theme: AppTheme) {
        prefs.edit().putString(KEY_THEME, theme.name).apply()
    }

    companion object {
        private const val PREFS_NAME = "recomp_prefs"
        private const val KEY_THEME = "app_theme"
    }
}
