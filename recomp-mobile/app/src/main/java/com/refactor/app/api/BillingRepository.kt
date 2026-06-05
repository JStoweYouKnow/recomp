package com.refactor.app.api

import com.refactor.app.BuildConfig
import com.refactor.app.api.dto.PlayPurchaseVerifyRequest
import com.refactor.app.api.dto.PlayPurchaseVerifyResponse
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType

class BillingRepository(
    private val client: HttpClient,
    private val baseUrl: String = BuildConfig.API_BASE_URL.trimEnd('/'),
) {

    /** Records a Play subscription purchase for server-side verification / entitlements (when configured). */
    suspend fun verifyPlaySubscription(body: PlayPurchaseVerifyRequest): Result<PlayPurchaseVerifyResponse> =
        runCatching {
            val response = client.post("$baseUrl/api/billing/google-play/verify") {
                contentType(ContentType.Application.Json)
                setBody(body)
            }
            response.requireSuccess { it.body<PlayPurchaseVerifyResponse>() }
        }
}
