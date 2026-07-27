package com.refactor.app.util

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.NutritionRecord
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.units.Energy
import androidx.health.connect.client.units.Mass
import java.time.Instant
import java.time.ZoneId

/**
 * Writes logged meals (nutrition) and completed workouts (exercise sessions) to Health
 * Connect. Android equivalent of iOS `HealthKitWriter`. Gated behind a user toggle; all
 * writes are best-effort and no-op when unavailable, disabled, or unauthorized.
 */
object HealthConnectWriter {
    private const val PREFS = "recomp_health_connect"
    private const val KEY_ENABLED = "enabled"

    val permissions: Set<String> = setOf(
        HealthPermission.getWritePermission(NutritionRecord::class),
        HealthPermission.getWritePermission(ExerciseSessionRecord::class),
    )

    fun isAvailable(context: Context): Boolean =
        HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE

    fun client(context: Context): HealthConnectClient? =
        if (isAvailable(context)) runCatching { HealthConnectClient.getOrCreate(context) }.getOrNull() else null

    fun isEnabled(context: Context): Boolean =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_ENABLED, false)

    fun setEnabled(context: Context, enabled: Boolean) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_ENABLED, enabled).apply()
    }

    suspend fun hasPermissions(context: Context): Boolean {
        val c = client(context) ?: return false
        return runCatching {
            c.permissionController.getGrantedPermissions().containsAll(permissions)
        }.getOrDefault(false)
    }

    suspend fun saveMeal(
        context: Context,
        name: String,
        calories: Int,
        protein: Double,
        carbs: Double,
        fat: Double,
        timeMillis: Long,
    ) {
        if (!isEnabled(context)) return
        val c = client(context) ?: return
        if (!hasPermissions(context)) return
        val time = Instant.ofEpochMilli(timeMillis)
        val offset = ZoneId.systemDefault().rules.getOffset(time)
        val record = NutritionRecord(
            startTime = time,
            startZoneOffset = offset,
            endTime = time.plusSeconds(1),
            endZoneOffset = offset,
            energy = if (calories > 0) Energy.kilocalories(calories.toDouble()) else null,
            protein = if (protein > 0) Mass.grams(protein) else null,
            totalCarbohydrate = if (carbs > 0) Mass.grams(carbs) else null,
            totalFat = if (fat > 0) Mass.grams(fat) else null,
            name = name,
            metadata = Metadata(),
        )
        runCatching { c.insertRecords(listOf(record)) }
    }

    suspend fun saveWorkout(context: Context, focus: String, startMillis: Long, endMillis: Long) {
        if (!isEnabled(context)) return
        if (endMillis <= startMillis) return
        val c = client(context) ?: return
        if (!hasPermissions(context)) return
        val start = Instant.ofEpochMilli(startMillis)
        val end = Instant.ofEpochMilli(endMillis)
        val zone = ZoneId.systemDefault().rules
        val record = ExerciseSessionRecord(
            startTime = start,
            startZoneOffset = zone.getOffset(start),
            endTime = end,
            endZoneOffset = zone.getOffset(end),
            exerciseType = ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING,
            title = "Recomp — $focus",
            metadata = Metadata(),
        )
        runCatching { c.insertRecords(listOf(record)) }
    }
}
