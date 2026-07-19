package com.refactor.app.api

data class RicoSkippedAction(
    val type: String,
    val reason: String,
)

data class RicoApplyResult(
    val applied: List<String> = emptyList(),
    val skipped: List<RicoSkippedAction> = emptyList(),
    val touchedMeals: Boolean = false,
    val touchedPlan: Boolean = false,
) {
    fun recordApplied(type: String): RicoApplyResult =
        copy(applied = applied + type)

    fun recordSkipped(type: String, reason: String): RicoApplyResult =
        copy(skipped = skipped + RicoSkippedAction(type, reason))

    fun statusSuffix(): String {
        val parts = mutableListOf<String>()
        if (applied.isNotEmpty()) {
            parts += "Applied ${applied.size} change(s)."
        }
        if (skipped.isNotEmpty()) {
            val detail = skipped.joinToString("; ") { "${it.type} (${it.reason})" }
            parts += "Ref couldn't apply: $detail"
        }
        return if (parts.isEmpty()) "" else "\n\n${parts.joinToString(" ")}"
    }
}

data class RicoApplyOutcome(
    val root: kotlinx.serialization.json.JsonObject,
    val result: RicoApplyResult,
)

data class RicoCacheApplyOutcome(
    val changed: Boolean,
    val result: RicoApplyResult,
)
