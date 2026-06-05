package com.refactor.app.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface CoachMessageDao {

    @Query("SELECT * FROM coach_messages ORDER BY createdAtEpochMillis ASC")
    fun observeMessages(): Flow<List<CoachMessageEntity>>

    @Query("SELECT * FROM coach_messages ORDER BY createdAtEpochMillis ASC")
    suspend fun listAllAsc(): List<CoachMessageEntity>

    @Insert
    suspend fun insert(entity: CoachMessageEntity)

    @Query("DELETE FROM coach_messages WHERE id = :id")
    suspend fun deleteById(id: String)

    @Query("DELETE FROM coach_messages")
    suspend fun clearAll()
}
