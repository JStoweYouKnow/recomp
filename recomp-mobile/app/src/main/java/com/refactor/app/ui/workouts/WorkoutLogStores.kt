package com.refactor.app.ui.workouts

import android.content.Context
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Records when a workout day's first set was completed, so a finished session has a real
 * elapsed duration for the post-workout summary. Mirrors iOS `WorkoutSessionClock`.
 */
class WorkoutSessionClock(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("recomp_workout_session", Context.MODE_PRIVATE)

    fun markStartedIfNeeded(dayKey: String) {
        if (!prefs.contains(dayKey)) prefs.edit().putLong(dayKey, System.currentTimeMillis()).apply()
    }

    fun startMillis(dayKey: String): Long? = prefs.getLong(dayKey, 0L).takeIf { it > 0 }

    fun clear(dayKey: String) = prefs.edit().remove(dayKey).apply()
}

/**
 * Tracks each exercise's best estimated one-rep-max (Epley) so new bests can be recognised
 * as personal records. Mirrors iOS `PersonalRecordStore`.
 */
class PersonalRecordStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("recomp_personal_records", Context.MODE_PRIVATE)

    private fun normalize(name: String) = name.trim().lowercase()

    fun estimatedOneRepMax(weightLbs: Double, reps: Int): Double =
        if (weightLbs > 0 && reps > 0) weightLbs * (1.0 + reps / 30.0) else 0.0

    fun best(exerciseName: String): Double = prefs.getFloat(normalize(exerciseName), 0f).toDouble()

    /**
     * Records a set; returns true only when it beats an *established* prior best (the first
     * log for an exercise seeds the record silently so a new exercise doesn't celebrate).
     */
    fun record(exerciseName: String, weightLbs: Double, reps: Int): Boolean {
        val oneRm = estimatedOneRepMax(weightLbs, reps)
        if (oneRm <= 0) return false
        val key = normalize(exerciseName)
        val prior = prefs.getFloat(key, 0f).toDouble()
        if (oneRm <= prior + 0.5) return false
        prefs.edit().putFloat(key, oneRm.toFloat()).apply()
        return prior > 0
    }
}

/**
 * Local per-set weight/reps logs used for PR detection, weight prefill (progressive overload),
 * and the post-workout summary's volume total. Mirrors iOS `WorkoutSetLogStorage` (local only;
 * weights are not pushed to the server on Android).
 */
class WorkoutWeightLogStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("recomp_workout_weight_logs", Context.MODE_PRIVATE)
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    @Serializable
    data class SetLog(
        val planId: String,
        val dayKey: String,
        val exerciseName: String,
        val setIndex: Int,
        val weightLbs: Double,
        val reps: Int,
        val loggedAt: Long,
    )

    private fun load(): MutableList<SetLog> {
        val raw = prefs.getString(KEY, null) ?: return mutableListOf()
        return runCatching { json.decodeFromString<List<SetLog>>(raw).toMutableList() }.getOrDefault(mutableListOf())
    }

    private fun save(logs: List<SetLog>) {
        prefs.edit().putString(KEY, json.encodeToString(logs.takeLast(10_000))).apply()
    }

    private fun logId(planId: String, dayKey: String, exerciseName: String, setIndex: Int) =
        "$planId|$dayKey|${exerciseName.trim().lowercase()}|$setIndex"

    fun record(planId: String, dayKey: String, exerciseName: String, setIndex: Int, weightLbs: Double, reps: Int) {
        val logs = load()
        val id = logId(planId, dayKey, exerciseName, setIndex)
        logs.removeAll { logId(it.planId, it.dayKey, it.exerciseName, it.setIndex) == id }
        logs.add(SetLog(planId, dayKey, exerciseName, setIndex, weightLbs, reps, System.currentTimeMillis()))
        save(logs)
    }

    fun lastWeight(exerciseName: String): Double? {
        val target = exerciseName.trim().lowercase()
        return load()
            .filter { it.exerciseName.trim().lowercase() == target && it.weightLbs > 0 }
            .maxByOrNull { it.loggedAt }
            ?.weightLbs
    }

    fun logsForDay(planId: String, dayKey: String): List<SetLog> =
        load().filter { it.planId == planId && it.dayKey == dayKey }

    fun volumeForDay(planId: String, dayKey: String): Double =
        logsForDay(planId, dayKey).sumOf { it.weightLbs * it.reps }

    companion object {
        private const val KEY = "logs_v1"
    }
}

/** Representative rep count parsed from a prescription string (first integer in e.g. "8-12"). */
fun parsePrescribedReps(reps: String): Int? =
    Regex("\\d+").find(reps)?.value?.toIntOrNull()
