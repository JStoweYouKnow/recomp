package com.refactor.app.network

import com.refactor.app.session.SessionStore
import io.ktor.client.HttpClient
import io.ktor.client.engine.android.Android
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.cookies.HttpCookies
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.defaultRequest
import io.ktor.client.request.header
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json

private const val REQUEST_TIMEOUT_MS = 30_000L

fun createHttpClient(sessionStore: SessionStore): HttpClient =
    HttpClient(Android) {
        install(HttpCookies)
        install(HttpTimeout) {
            requestTimeoutMillis = REQUEST_TIMEOUT_MS
            connectTimeoutMillis = REQUEST_TIMEOUT_MS
            socketTimeoutMillis = REQUEST_TIMEOUT_MS
        }
        install(ContentNegotiation) {
            json(
                Json {
                    ignoreUnknownKeys = true
                    isLenient = true
                    encodeDefaults = false
                }
            )
        }
        defaultRequest {
            header("Accept", "application/json")
            // Server auth (`src/lib/auth.ts`) expects `Authorization: Bearer <token>`.
            // The legacy X-Refactor-User-Id header was removed server-side (impersonation risk).
            sessionStore.getToken()?.let { token ->
                header("Authorization", "Bearer $token")
            }
        }
    }
