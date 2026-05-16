package com.recomp.app.api

import com.recomp.app.BuildConfig
import com.recomp.app.api.dto.LoginRequest
import com.recomp.app.api.dto.LoginResponse
import com.recomp.app.api.dto.MeResponse
import com.recomp.app.session.SessionStore
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType

class AuthRepository(
    private val client: HttpClient,
    private val sessionStore: SessionStore,
    private val baseUrl: String = BuildConfig.API_BASE_URL.trimEnd('/'),
) {

    suspend fun login(email: String, password: String): Result<LoginResponse> =
        runCatching {
            val response = client.post("$baseUrl/api/auth/login") {
                contentType(ContentType.Application.Json)
                setBody(LoginRequest(email.trim(), password))
            }
            val body = response.requireSuccess { it.body<LoginResponse>() }
            body.userId?.let { sessionStore.setUserId(it) }
            body
        }

    suspend fun me(): Result<MeResponse> =
        runCatching {
            val response = client.get("$baseUrl/api/auth/me")
            val body = try {
                response.requireSuccess { it.body<MeResponse>() }
            } catch (e: ApiException) {
                if (e.code == 401) sessionStore.clear()
                throw e
            }
            when {
                body.authenticated && body.profile != null ->
                    body.userId?.let { sessionStore.setUserId(it) }
                else -> sessionStore.clear()
            }
            body
        }

    fun logout() {
        sessionStore.clear()
    }
}
