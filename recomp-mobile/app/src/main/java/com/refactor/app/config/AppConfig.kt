package com.refactor.app.config

import com.refactor.app.BuildConfig

object AppConfig {
    val apiBaseUrl: String get() = BuildConfig.API_BASE_URL
    val environment: String get() = BuildConfig.ENVIRONMENT
}
