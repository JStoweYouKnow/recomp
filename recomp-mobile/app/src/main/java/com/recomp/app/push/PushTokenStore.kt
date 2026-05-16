package com.recomp.app.push

import android.content.Context

/**
 * Remembers the last FCM token registered with the server so we can [unsubscribe] on logout.
 */
class PushTokenStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun getLastToken(): String? = prefs.getString(KEY_TOKEN, null)?.trim()?.takeIf { it.isNotEmpty() }

    fun setLastToken(token: String) {
        prefs.edit().putString(KEY_TOKEN, token).apply()
    }

    fun clear() {
        prefs.edit().remove(KEY_TOKEN).apply()
    }

    companion object {
        private const val PREFS = "recomp_push"
        private const val KEY_TOKEN = "fcm_token"
    }
}
