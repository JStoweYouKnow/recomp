package com.recomp.app.db

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "coach_messages")
data class CoachMessageEntity(
    @PrimaryKey val id: String,
    /** `"user"` | `"assistant"` — matches sync `ricoHistory.role`. */
    val role: String,
    val content: String,
    val createdAtEpochMillis: Long,
)
