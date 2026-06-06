package com.refactor.app.api

import com.refactor.app.BuildConfig
import com.refactor.app.api.dto.ApiTokenResponseDto
import com.refactor.app.api.dto.CalendarTokenResponseDto
import io.ktor.client.HttpClient
import io.ktor.client.request.post
import io.ktor.client.statement.bodyAsText

class UserToolsRepository(
    private val client: HttpClient,
    private val baseUrl: String = BuildConfig.API_BASE_URL.trimEnd('/'),
) {
    suspend fun generateApiToken(): Result<ApiTokenResponseDto> = runCatching {
        val response = client.post("$baseUrl/api/user/api-token")
        response.ensureSuccessOrThrow()
        SyncJson.format.decodeFromString<ApiTokenResponseDto>(response.bodyAsText())
    }

    suspend fun generateCalendarToken(): Result<CalendarTokenResponseDto> = runCatching {
        val response = client.post("$baseUrl/api/calendar/token")
        response.ensureSuccessOrThrow()
        SyncJson.format.decodeFromString<CalendarTokenResponseDto>(response.bodyAsText())
    }

    fun calendarFeedUrl(token: String): String {
        val enc = java.net.URLEncoder.encode(token, Charsets.UTF_8.name())
        return "$baseUrl/api/calendar/feed?token=$enc"
    }
}
