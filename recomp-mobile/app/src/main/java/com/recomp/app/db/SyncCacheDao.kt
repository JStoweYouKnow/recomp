package com.recomp.app.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface SyncCacheDao {

    @Query("SELECT * FROM sync_cache WHERE id = 1 LIMIT 1")
    fun observe(): Flow<SyncCacheEntity?>

    @Query("SELECT * FROM sync_cache WHERE id = 1 LIMIT 1")
    suspend fun getOnce(): SyncCacheEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: SyncCacheEntity)
}
