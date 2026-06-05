package com.refactor.app.push

import android.app.Application
import com.refactor.app.BuildConfig
import com.refactor.app.api.ensureSuccessOrThrow
import com.refactor.app.network.createHttpClient
import com.refactor.app.session.SessionStore
import com.google.firebase.messaging.FirebaseMessaging
import io.ktor.client.HttpClient
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import kotlinx.coroutines.tasks.await
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

object PushRegistrar {

    private val json = Json { ignoreUnknownKeys = true }

    suspend fun register(context: android.content.Context) {
        if (BuildConfig.FIREBASE_PROJECT_ID.isBlank()) return
        val appCtx = context.applicationContext
        FirebaseBootstrap.init(appCtx as Application)
        val session = SessionStore(appCtx)
        if (session.getUserId().isNullOrBlank()) return

        val token = runCatching { FirebaseMessaging.getInstance().token.await() }.getOrNull()
            ?: return
        registerWithToken(appCtx, token)
    }

    /** Used when Firebase delivers a fresh registration token before [register] runs. */
    suspend fun registerWithToken(context: android.content.Context, token: String) {
        if (BuildConfig.FIREBASE_PROJECT_ID.isBlank()) return
        val appCtx = context.applicationContext
        FirebaseBootstrap.init(appCtx as Application)
        val session = SessionStore(appCtx)
        if (session.getUserId().isNullOrBlank()) return
        val client = createHttpClient(session)
        client.use { subscribe(it, token) }
        PushTokenStore(appCtx).setLastToken(token)
    }

    suspend fun unsubscribe(context: android.content.Context) {
        val appCtx = context.applicationContext
        val session = SessionStore(appCtx)
        val store = PushTokenStore(appCtx)
        val token = store.getLastToken() ?: return
        if (session.getUserId().isNullOrBlank()) {
            store.clear()
            return
        }
        val client = createHttpClient(session)
        client.use { unsub(it, token) }
        store.clear()
    }

    private suspend fun subscribe(client: HttpClient, token: String) {
        val baseUrl = BuildConfig.API_BASE_URL.trimEnd('/')
        val response = client.post("$baseUrl/api/push/subscribe-fcm") {
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(FcmTokenBody.serializer(), FcmTokenBody(token)))
        }
        response.ensureSuccessOrThrow()
    }

    private suspend fun unsub(client: HttpClient, token: String) {
        val baseUrl = BuildConfig.API_BASE_URL.trimEnd('/')
        val response = client.post("$baseUrl/api/push/unsubscribe-fcm") {
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(FcmTokenBody.serializer(), FcmTokenBody(token)))
        }
        runCatching { response.ensureSuccessOrThrow() }
    }

    @Serializable
    private data class FcmTokenBody(val token: String)
}
