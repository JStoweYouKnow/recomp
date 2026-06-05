package com.refactor.app.ui.workouts

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** Turns a stored progress blob into short lines (JSON objects → key/value rows). */
internal fun summarizeProgressPayload(payload: String): List<String> {
    val trimmed = payload.trim()
    if (trimmed.isEmpty()) return emptyList()
    val root = runCatching {
        kotlinx.serialization.json.Json.parseToJsonElement(trimmed).jsonObject
    }.getOrNull()
        ?: return listOf(trimmed)
    return root.entries.map { (k, v) ->
        "$k: ${formatJsonLeaf(v)}"
    }
}

private fun formatJsonLeaf(el: JsonElement): String =
    when (el) {
        is JsonPrimitive -> {
            el.booleanOrNull?.toString()
                ?: el.intOrNull?.toString()
                ?: el.doubleOrNull?.toString()
                ?: el.contentOrNull?.takeIf { it.isNotBlank() }
                ?: el.toString()
        }
        else -> el.toString()
    }
