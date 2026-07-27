package com.refactor.app.util

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.widget.Toast

/**
 * Lightweight haptic + message feedback. The Android equivalent of the iOS `Haptics` +
 * toast/confetti helpers: a vibration for tactile confirmation and a Toast for the message
 * (Android has no built-in confetti, so a celebratory buzz + toast stands in).
 */
object Feedback {

    private fun vibrator(context: Context): Vibrator? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }

    /** A short tick — e.g. completing a single set. */
    fun tick(context: Context) {
        val v = vibrator(context) ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            v.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_TICK))
        } else {
            v.vibrate(VibrationEffect.createOneShot(15, VibrationEffect.DEFAULT_AMPLITUDE))
        }
    }

    /** A double pulse — success (meal logged, workout complete). */
    fun success(context: Context) {
        val v = vibrator(context) ?: return
        v.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 30, 70, 40), -1))
    }

    /** Celebratory feedback + message. Android stand-in for iOS confetti + toast. */
    fun celebrate(context: Context, message: String) {
        success(context)
        toast(context, message)
    }

    fun toast(context: Context, message: String) {
        Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
    }
}
