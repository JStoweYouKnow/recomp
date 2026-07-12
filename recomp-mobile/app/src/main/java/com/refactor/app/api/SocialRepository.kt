package com.refactor.app.api

import com.refactor.app.BuildConfig
import com.refactor.app.api.dto.SocialSettingsDto
import com.refactor.app.api.dto.UsernameCheckResponseDto
import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

class SocialRepository(
    private val client: HttpClient,
    private val baseUrl: String = BuildConfig.API_BASE_URL.trimEnd('/'),
) {
    suspend fun getSettings(): Result<SocialSettingsDto> = runCatching {
        val response = client.get("$baseUrl/api/social/settings")
        response.ensureSuccessOrThrow()
        SyncJson.format.decodeFromString<SocialSettingsDto>(response.bodyAsText())
    }

    suspend fun updateSettings(visibility: String, username: String?): Result<SocialSettingsDto> = runCatching {
        val response = client.put("$baseUrl/api/social/settings") {
            contentType(ContentType.Application.Json)
            setBody(
                buildJsonObject {
                    put("visibility", visibility)
                    username?.let { put("username", it) }
                },
            )
        }
        response.ensureSuccessOrThrow()
        SyncJson.format.decodeFromString<SocialSettingsDto>(response.bodyAsText())
    }

    suspend fun checkUsername(username: String): Result<Boolean> = runCatching {
        val response = client.post("$baseUrl/api/social/username/check") {
            contentType(ContentType.Application.Json)
            setBody(buildJsonObject { put("username", username) })
        }
        response.ensureSuccessOrThrow()
        SyncJson.format.decodeFromString<UsernameCheckResponseDto>(response.bodyAsText()).available
    }
}
