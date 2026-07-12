package com.refactor.app.api

import com.refactor.app.BuildConfig
import io.ktor.client.HttpClient
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

class WearableConnectRepository(
    private val client: HttpClient,
    private val baseUrl: String = BuildConfig.API_BASE_URL.trimEnd('/'),
) {
    suspend fun connectOura(token: String): Result<Unit> = runCatching {
        val response = client.post("$baseUrl/api/wearables/oura/connect") {
            contentType(ContentType.Application.Json)
            setBody(buildJsonObject { put("token", token.trim()) })
        }
        response.ensureSuccessOrThrow()
    }

    fun fitbitAuthUrl(): String = "$baseUrl/api/wearables/fitbit/auth"
}
