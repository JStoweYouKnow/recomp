package com.recomp.app.config

import com.recomp.app.BuildConfig

object AppConfig {
    val apiBaseUrl: String get() = BuildConfig.API_BASE_URL
    val environment: String get() = BuildConfig.ENVIRONMENT
}
