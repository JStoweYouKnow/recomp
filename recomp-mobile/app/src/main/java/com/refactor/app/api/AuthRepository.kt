package com.refactor.app.api

import com.refactor.app.BuildConfig
import com.refactor.app.api.dto.ClaimAccountRequest
import com.refactor.app.api.dto.ForgotPasswordRequest
import com.refactor.app.api.dto.LoginRequest
import com.refactor.app.api.dto.LoginResponse
import com.refactor.app.api.dto.MeResponse
import com.refactor.app.api.dto.RegisterRequest
import com.refactor.app.api.dto.ResetPasswordRequest
import com.refactor.app.session.SessionStore
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.delete
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
            body.apiToken?.let { sessionStore.setToken(it) }
            body
        }

    /** `/api/auth/register` — creates an account and establishes a session (like login). */
    suspend fun register(request: RegisterRequest): Result<LoginResponse> =
        runCatching {
            val response = client.post("$baseUrl/api/auth/register") {
                contentType(ContentType.Application.Json)
                setBody(request)
            }
            val body = response.requireSuccess { it.body<LoginResponse>() }
            body.userId?.let { sessionStore.setUserId(it) }
            body.apiToken?.let { sessionStore.setToken(it) }
            body
        }

    /** `/api/auth/forgot-password` — emails a 6-digit reset code. Always succeeds for valid emails. */
    suspend fun forgotPassword(email: String): Result<Unit> =
        runCatching {
            val response = client.post("$baseUrl/api/auth/forgot-password") {
                contentType(ContentType.Application.Json)
                setBody(ForgotPasswordRequest(email.trim()))
            }
            response.ensureSuccessOrThrow()
        }

    /** `/api/auth/reset-password` — sets a new password using the emailed code. */
    suspend fun resetPassword(email: String, code: String, newPassword: String): Result<Unit> =
        runCatching {
            val response = client.post("$baseUrl/api/auth/reset-password") {
                contentType(ContentType.Application.Json)
                setBody(ResetPasswordRequest(email.trim(), code.trim(), newPassword))
            }
            response.ensureSuccessOrThrow()
        }

    /** `/api/auth/demo` — explore the app without creating an account. */
    suspend fun demo(): Result<LoginResponse> =
        runCatching {
            val response = client.post("$baseUrl/api/auth/demo")
            val body = response.requireSuccess { it.body<LoginResponse>() }
            body.userId?.let { sessionStore.setUserId(it) }
            body.apiToken?.let { sessionStore.setToken(it) }
            body
        }

    /** `/api/auth/claim` — link email/password to the current (demo) account. */
    suspend fun claimAccount(email: String, password: String): Result<Unit> =
        runCatching {
            val response = client.post("$baseUrl/api/auth/claim") {
                contentType(ContentType.Application.Json)
                setBody(ClaimAccountRequest(email.trim(), password))
            }
            response.ensureSuccessOrThrow()
        }

    /** `DELETE /api/user/account` — permanently deletes the signed-in account. */
    suspend fun deleteAccount(): Result<Unit> =
        runCatching {
            val response = client.delete("$baseUrl/api/user/account")
            response.ensureSuccessOrThrow()
            sessionStore.clear()
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
