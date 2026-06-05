package com.refactor.app.session

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Persists the server **user id** used as session credentials via [HEADER_USER_ID],
 * matching iOS Keychain + [com.refactor.app.network.RefactorHeaders].
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

    fun clear() {
        prefs.edit().remove(KEY_USER_ID).apply()
    }

    companion object {
        private const val PREFS_NAME = "refactor_session"
        private const val KEY_USER_ID = "user_id"
    }
}
