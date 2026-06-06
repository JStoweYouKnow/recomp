package com.refactor.app.session

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Persists the server session credentials: the **API token** sent as
 * `Authorization: Bearer <token>` (mobile auth, matching `src/lib/auth.ts`) plus the
 * **user id** kept for local display / group calls.
 *
 * Uses [EncryptedSharedPreferences] when available, but falls back to standard
 * app-private [SharedPreferences] if the encrypted store cannot be initialized
 * (e.g. Tink stripped by R8, or a corrupted Android Keystore entry). Without this
 * fallback such a failure crashes the app on launch, since the store is created
 * during startup.
 */
class SessionStore(context: Context) {

    private val prefs: SharedPreferences = createPrefs(context.applicationContext)

    private fun createPrefs(context: Context): SharedPreferences {
        return try {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            EncryptedSharedPreferences.create(
                context,
                PREFS_NAME,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
            )
        } catch (t: Throwable) {
            Log.e(TAG, "EncryptedSharedPreferences unavailable; using app-private fallback", t)
            // A stale/corrupt encrypted file would also break the fallback read path,
            // so use a separate file name for the unencrypted store.
            context.getSharedPreferences(PREFS_NAME_FALLBACK, Context.MODE_PRIVATE)
        }
    }

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
        private const val TAG = "SessionStore"
        private const val PREFS_NAME = "refactor_session"
        private const val PREFS_NAME_FALLBACK = "refactor_session_plain"
        private const val KEY_USER_ID = "user_id"
        private const val KEY_TOKEN = "api_token"
    }
}
