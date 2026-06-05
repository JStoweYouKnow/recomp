package com.refactor.app.api

import kotlinx.serialization.json.Json

/** Matches Ktor [ContentNegotiation] json settings — safe for decoding cached snapshots. */
object SyncJson {
    val format = Json {
        ignoreUnknownKeys = true
        isLenient = true
        encodeDefaults = false
    }
}
