package com.refactor.app.prefs

import android.content.Context

class MusicPrefs(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun provider(): String = prefs.getString(KEY_PROVIDER, PROVIDER_SPOTIFY) ?: PROVIDER_SPOTIFY
    fun soundEffectsEnabled(): Boolean = prefs.getBoolean(KEY_SFX, true)

    fun setProvider(value: String) = prefs.edit().putString(KEY_PROVIDER, value).apply()
    fun setSoundEffectsEnabled(on: Boolean) = prefs.edit().putBoolean(KEY_SFX, on).apply()

    companion object {
        const val PROVIDER_SPOTIFY = "spotify"
        const val PROVIDER_APPLE_MUSIC = "apple_music"
        private const val PREFS = "refactor_music_prefs"
        private const val KEY_PROVIDER = "music_provider"
        private const val KEY_SFX = "sound_effects_enabled"
    }
}
