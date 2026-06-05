package com.refactor.app.api

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject

/**
 * Maps a **GET /api/data/sync** JSON root into a **POST /api/data/sync** body.
 * Flattens `meta.{xp,hasAdjusted,ricoHistory,measurementTargets}` to top-level (see `sync-schema.ts`).
 */
internal fun buildSyncPushPayload(cacheRoot: JsonObject): JsonObject {
    val copyKeys = setOf(
        "profile",
        "plan",
        "meals",
        "milestones",
        "wearableConnections",
        "wearableData",
        "hydration",
        "fastingSessions",
        "biofeedback",
        "pantry",
        "bodyScans",
        "supplements",
        "bloodWork",
        "activityLog",
        "workoutProgress",
        "metabolicModel",
        "recentExerciseNames",
    )
    val metaKeys = listOf("xp", "hasAdjusted", "ricoHistory", "measurementTargets")

    return buildJsonObject {
        for (key in copyKeys) {
            cacheRoot[key]?.let { put(key, it) }
        }
        cacheRoot["meta"]?.jsonObject?.let { meta ->
            for (mk in metaKeys) {
                meta[mk]?.let { put(mk, it) }
            }
        }
    }
}
