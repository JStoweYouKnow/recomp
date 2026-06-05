package com.recomp.app.db

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "sync_cache")
data class SyncCacheEntity(
    @PrimaryKey val id: Int = 1,
    val payloadJson: String,
    val fetchedAtEpochMillis: Long,
)
