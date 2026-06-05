package com.refactor.app.db

import androidx.room.Database
import androidx.room.RoomDatabase

@Database(
    entities = [SyncCacheEntity::class, CoachMessageEntity::class],
    version = 2,
    exportSchema = false,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun syncCacheDao(): SyncCacheDao
    abstract fun coachMessageDao(): CoachMessageDao
}
