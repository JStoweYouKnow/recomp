package com.recomp.app.push

import android.app.Application
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.recomp.app.BuildConfig

/**
 * Initializes Firebase when [BuildConfig.FIREBASE_PROJECT_ID] is set (e.g. via `gradle.properties`).
 * When empty, the app runs without FCM; push registration is skipped.
 */
object FirebaseBootstrap {
    fun init(app: Application) {
        val pid = BuildConfig.FIREBASE_PROJECT_ID.trim()
        if (pid.isEmpty()) return
        if (FirebaseApp.getApps(app).isNotEmpty()) return
        runCatching {
            FirebaseApp.initializeApp(
                app,
                FirebaseOptions.Builder()
                    .setApplicationId(BuildConfig.FIREBASE_APP_ID.trim())
                    .setApiKey(BuildConfig.FIREBASE_API_KEY.trim())
                    .setProjectId(pid)
                    .build(),
            )
        }
    }
}
