package com.recomp.app.api

import com.recomp.app.BuildConfig
import com.recomp.app.api.dto.RicoToolActionWire
import com.recomp.app.api.dto.SyncGetResponse
import com.recomp.app.db.CoachMessageDao
import com.recomp.app.db.SyncCacheDao
import com.recomp.app.db.SyncCacheEntity
import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject

class SyncRepository(
    private val client: HttpClient,
    private val syncCacheDao: SyncCacheDao,
    private val baseUrl: String = BuildConfig.API_BASE_URL.trimEnd('/'),
) {

    /**
     * Full server snapshot — same contract as iOS `SyncService` pull / web sync GET.
     * Persists **raw JSON** to Room for offline / cross-tab reads (meals list, etc.).
     */
    suspend fun fetchSnapshot(): Result<SyncGetResponse> =
        runCatching {
            val response = client.get("$baseUrl/api/data/sync")
            response.ensureSuccessOrThrow()
            val raw = response.bodyAsText()
            val typed = SyncJson.format.decodeFromString<SyncGetResponse>(raw)
            syncCacheDao.upsert(
                SyncCacheEntity(
                    payloadJson = raw,
                    fetchedAtEpochMillis = System.currentTimeMillis(),
                )
            )
            typed
        }

    /**
     * POST `/api/data/sync` — pushes fields from the cached GET snapshot (flattened `meta`).
     * Matches iOS/web full upsert when echoing server state after pull.
     */
    suspend fun pushCachedSnapshot(): Result<Unit> =
        runCatching {
            val raw = syncCacheDao.getOnce()?.payloadJson
                ?: error("No cached snapshot — refresh sync first.")
            val root = SyncJson.format.parseToJsonElement(raw).jsonObject
            val payload = buildSyncPushPayload(root)
            val response = client.post("$baseUrl/api/data/sync") {
                contentType(ContentType.Application.Json)
                setBody(SyncJson.format.encodeToString(JsonElement.serializer(), payload))
            }
            response.ensureSuccessOrThrow()
        }

    /**
     * Updates the Room snapshot by applying [transform] to the decoded GET payload (iOS parity for local edits).
     * Call [pushCachedSnapshot] afterward so the server receives the change.
     */
    suspend fun mutateCachedSnapshot(transform: (SyncGetResponse) -> SyncGetResponse): Result<Unit> =
        runCatching {
            val entity = syncCacheDao.getOnce() ?: error("No cached snapshot — open Today and refresh first.")
            val snap = SyncJson.format.decodeFromString<SyncGetResponse>(entity.payloadJson)
            val updated = transform(snap)
            val raw = SyncJson.format.encodeToString(SyncGetResponse.serializer(), updated)
            syncCacheDao.upsert(
                SyncCacheEntity(
                    payloadJson = raw,
                    fetchedAtEpochMillis = System.currentTimeMillis(),
                ),
            )
        }

    /**
     * Merges Rico tool actions into the cached GET JSON (iOS/web parity) and persists to Room.
     * @return true if the cache was updated
     */
    suspend fun applyRicoActionsToCache(actions: List<RicoToolActionWire>): Result<Boolean> =
        runCatching {
            if (actions.isEmpty()) return@runCatching false
            val entity = syncCacheDao.getOnce() ?: return@runCatching false
            val root = SyncJson.format.parseToJsonElement(entity.payloadJson).jsonObject
            val merged = RicoSyncActionApplier.apply(root, actions)
            val out = SyncJson.format.encodeToString(JsonElement.serializer(), merged)
            if (out == entity.payloadJson) return@runCatching false
            syncCacheDao.upsert(
                SyncCacheEntity(
                    payloadJson = out,
                    fetchedAtEpochMillis = System.currentTimeMillis(),
                )
            )
            true
        }

    /**
     * Writes [**`meta.ricoHistory`**] from local coach messages (max 100 entries, content capped for sync schema).
     * Call after persisting user + assistant rows so POST flatten includes chat for Dynamo.
     */
    suspend fun mergeCoachHistoryIntoCachedSnapshot(coachMessageDao: CoachMessageDao): Result<Boolean> =
        runCatching {
            val rows = coachMessageDao.listAllAsc()
            if (rows.isEmpty()) return@runCatching false
            val entity = syncCacheDao.getOnce() ?: return@runCatching false
            val root = SyncJson.format.parseToJsonElement(entity.payloadJson).jsonObject
            val historyArr = buildJsonArray {
                rows.takeLast(RICO_HISTORY_MAX).forEach { r ->
                    val role = when (r.role) {
                        "user" -> "user"
                        else -> "assistant"
                    }
                    add(
                        buildJsonObject {
                            put("role", JsonPrimitive(role))
                            put("content", JsonPrimitive(r.content.take(RICO_CONTENT_MAX)))
                            put("at", JsonPrimitive(r.createdAtEpochMillis.toString()))
                        },
                    )
                }
            }
            val meta = root["meta"]?.jsonObject ?: buildJsonObject {}
            val newMeta = buildJsonObject {
                meta.entries.forEach { (k, v) ->
                    if (k != "ricoHistory") put(k, v)
                }
                put("ricoHistory", historyArr)
            }
            val newRoot = buildJsonObject {
                root.entries.forEach { (k, v) ->
                    if (k != "meta") put(k, v)
                }
                put("meta", newMeta)
            }
            val out = SyncJson.format.encodeToString(JsonElement.serializer(), newRoot)
            if (out == entity.payloadJson) return@runCatching false
            syncCacheDao.upsert(
                SyncCacheEntity(
                    payloadJson = out,
                    fetchedAtEpochMillis = System.currentTimeMillis(),
                ),
            )
            true
        }

    companion object {
        private const val RICO_HISTORY_MAX = 100
        private const val RICO_CONTENT_MAX = 10_000
    }
}
