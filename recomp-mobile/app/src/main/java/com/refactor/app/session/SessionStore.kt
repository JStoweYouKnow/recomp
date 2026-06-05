package com.refactor.app.session

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Persists the server session credentials: the **API token** sent as
 * `Authorization: Bearer <token>` (mobile auth, matching `src/lib/auth.ts`) plus the
 * **user id** kept for local display / group calls.
 */
class SessionStore(context: Context) {

    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val prefs = EncryptedSharedPreferences.create(
        context,
        PREFS_NAME,
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    fun getUserId(): String? =
        prefs.getString(KEY_USER_ID, null)?.trim()?.takeIf { it.isNotEmpty() }

    fun setUserId(userId: String) {
        prefs.edit().putString(KEY_USER_ID, userId.trim()).apply()
    }

    /** Bearer token used for `Authorization` on API requests. */
    fun getToken(): String? =
        prefs.getString(KEY_TOKEN, null)?.trim()?.takeIf { it.isNotEmpty() }

    fun setToken(token: String) {
        prefs.edit().putString(KEY_TOKEN, token.trim()).apply()
    }

    fun clear() {
        prefs.edit().remove(KEY_USER_ID).remove(KEY_TOKEN).apply()
    }

    companion object {
        private const val PREFS_NAME = "refactor_session"
        private const val KEY_USER_ID = "user_id"
        private const val KEY_TOKEN = "api_token"
    }
}
