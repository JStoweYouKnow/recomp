package com.refactor.app.api

import com.refactor.app.BuildConfig
import com.refactor.app.api.dto.BloodWorkParseResponseDto
import com.refactor.app.api.dto.SupplementAnalysisResponseDto
import io.ktor.client.HttpClient
import io.ktor.client.request.forms.MultiPartFormDataContent
import io.ktor.client.request.forms.formData
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.Headers
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray

class HealthExtrasRepository(
    private val client: HttpClient,
    private val baseUrl: String = BuildConfig.API_BASE_URL.trimEnd('/'),
) {
    suspend fun analyzeSupplements(
        supplementNames: List<String>,
        goal: String? = null,
    ): Result<SupplementAnalysisResponseDto> = runCatching {
        val response = client.post("$baseUrl/api/supplements/analyze") {
            contentType(ContentType.Application.Json)
            setBody(
                buildJsonObject {
                    putJsonArray("supplements") {
                        supplementNames.forEach { add(JsonPrimitive(it)) }
                    }
                    goal?.let { put("goal", it) }
                },
            )
        }
        response.ensureSuccessOrThrow()
        SyncJson.format.decodeFromString<SupplementAnalysisResponseDto>(response.bodyAsText())
    }

    suspend fun parseBloodWork(imageBytes: ByteArray): Result<BloodWorkParseResponseDto> = runCatching {
        val response = client.post("$baseUrl/api/bloodwork/parse") {
            setBody(
                MultiPartFormDataContent(
                    formData {
                        append("image", imageBytes, Headers.build {
                            append(HttpHeaders.ContentType, "image/jpeg")
                            append(HttpHeaders.ContentDisposition, "filename=bloodwork.jpg")
                        })
                    },
                ),
            )
        }
        response.ensureSuccessOrThrow()
        SyncJson.format.decodeFromString<BloodWorkParseResponseDto>(response.bodyAsText())
    }
}
