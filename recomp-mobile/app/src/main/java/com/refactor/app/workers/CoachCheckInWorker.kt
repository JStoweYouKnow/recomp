package com.refactor.app.workers

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.refactor.app.BuildConfig
import com.refactor.app.push.RefactorNotifications
import com.refactor.app.session.SessionStore
import io.ktor.client.HttpClient
import io.ktor.client.engine.android.Android
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.bearerAuth
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.util.concurrent.TimeUnit

/**
 * Fires every 8 hours as a local fallback for coach check-in push notifications.
 * The server-side Vercel cron + FCM is the primary delivery path; this worker
 * covers gaps when push tokens are stale or delivery is delayed.
 */
class CoachCheckInWorker(
    ctx: Context,
    params: WorkerParameters,
) : CoroutineWorker(ctx, params) {

    @Serializable
    private data class CheckInBody(val name: String? = null)

    @Serializable
    private data class CheckInResponseDto(val message: String = "", val tone: String = "neutral")

    override suspend fun doWork(): Result {
        val sessionStore = SessionStore(applicationContext)
        val token = sessionStore.getToken() ?: return Result.success()

        val lenientJson = Json { ignoreUnknownKeys = true }
        val client = HttpClient(Android) {
            install(ContentNegotiation) { json(lenientJson) }
        }

        return try {
            val baseUrl = BuildConfig.API_BASE_URL.trimEnd('/')
            val response = client.post("$baseUrl/api/coach/check-in") {
                bearerAuth(token)
                contentType(ContentType.Application.Json)
                setBody(CheckInBody())
            }
            if (response.status.isSuccess()) {
                val raw = response.bodyAsText()
                val parsed = runCatching {
                    lenientJson.decodeFromString<CheckInResponseDto>(raw)
                }.getOrNull()
                if (!parsed?.message.isNullOrBlank()) {
                    RefactorNotifications.showReminder(
                        context = applicationContext,
                        title = "The Ref",
                        body = parsed!!.message,
                    )
                }
            }
            Result.success()
        } catch (_: Exception) {
            Result.retry()
        } finally {
            client.close()
        }
    }

    companion object {
        private const val WORK_NAME = "coach_check_in_periodic"

        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<CoachCheckInWorker>(8, TimeUnit.HOURS)
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                request,
            )
        }
    }
}
