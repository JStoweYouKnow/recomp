package com.refactor.app.api

import com.refactor.app.BuildConfig
import com.refactor.app.api.dto.CoachChatResponse
import com.refactor.app.api.dto.RicoChatRequest
import com.refactor.app.api.dto.RicoContextDto
import com.refactor.app.api.dto.RicoHistoryMessageDto
import io.ktor.client.HttpClient
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType

class CoachRepository(
    private val client: HttpClient,
    private val baseUrl: String = BuildConfig.API_BASE_URL.trimEnd('/'),
) {

    /** POST `/api/rico` — same contract as web / iOS RefactorKit `CoachAPI.chat`. */
    suspend fun chat(
        message: String,
        context: RicoContextDto?,
        history: List<RicoHistoryMessageDto>? = null,
        persona: String? = null,
    ): Result<CoachChatResponse> =
        runCatching {
            val response = client.post("$baseUrl/api/rico") {
                contentType(ContentType.Application.Json)
                setBody(RicoChatRequest(message = message.trim(), context = context, persona = persona, history = history))
            }
            response.ensureSuccessOrThrow()
            val raw = response.bodyAsText()
            SyncJson.format.decodeFromString<CoachChatResponse>(raw)
        }
}
