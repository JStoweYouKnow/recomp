package com.recomp.app.prefs

import android.content.Context

/**
 * Whether returning from background requires biometric unlock ([com.recomp.app.ui.security.BiometricGate]).
 */
class BiometricPrefs(context: Context) {

    private val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun isEnabled(): Boolean = prefs.getBoolean(KEY_ENABLED, false)

    fun setEnabled(value: Boolean) {
        prefs.edit().putBoolean(KEY_ENABLED, value).apply()
    }

    companion object {
        private const val PREFS_NAME = "recomp_prefs"
        private const val KEY_ENABLED = "biometric_gate_enabled"
    }
}
