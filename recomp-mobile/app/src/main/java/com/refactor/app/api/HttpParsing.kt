package com.refactor.app.api

import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive

internal suspend fun <T> HttpResponse.requireSuccess(parse: suspend (HttpResponse) -> T): T {
    if (status != HttpStatusCode.OK && status != HttpStatusCode.Created) {
        val raw = runCatching { bodyAsText() }.getOrNull().orEmpty()
        throw ApiException(status.value, parseErrorMessage(raw) ?: raw.ifBlank { "HTTP ${status.value}" })
    }
    return parse(this)
}

internal suspend fun HttpResponse.ensureSuccessOrThrow() {
    if (status != HttpStatusCode.OK && status != HttpStatusCode.Created) {
        val raw = runCatching { bodyAsText() }.getOrNull().orEmpty()
        throw ApiException(status.value, parseErrorMessage(raw) ?: raw.ifBlank { "HTTP ${status.value}" })
    }
}

internal fun parseErrorMessage(jsonText: String): String? {
    if (jsonText.isBlank()) return null
    return runCatching {
        val el = Json.parseToJsonElement(jsonText)
        if (el is JsonObject) {
            el["error"]?.jsonPrimitive?.content
                ?: el["message"]?.jsonPrimitive?.content
                ?: el["redirect"]?.let { "Unable to reach server. Please try again." }
        } else null
    }.getOrNull()
}
