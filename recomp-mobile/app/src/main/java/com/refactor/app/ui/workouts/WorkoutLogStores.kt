package com.refactor.app.ui.workouts

import android.content.Context
import com.refactor.app.api.dto.WorkoutSetLogDto
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
        /**
         * Rating of perceived exertion (6–10). Feeds RIR-adjusted e1RM in [Progression] so
         * submaximal sets stay comparable. Defaulted for logs written before RPE capture existed.
         */
        val rpe: Double? = null,
        /** "warmup" | "main" | "finisher" — warmups are excluded from progression. */
        val section: String = "main",
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

    fun record(
        planId: String,
        dayKey: String,
        exerciseName: String,
        setIndex: Int,
        weightLbs: Double,
        reps: Int,
        rpe: Double? = null,
        section: String = "main",
    ) {
        val logs = load()
        val id = logId(planId, dayKey, exerciseName, setIndex)
        logs.removeAll { logId(it.planId, it.dayKey, it.exerciseName, it.setIndex) == id }
        logs.add(
            SetLog(
                planId = planId,
                dayKey = dayKey,
                exerciseName = exerciseName,
                setIndex = setIndex,
                weightLbs = weightLbs,
                reps = reps,
                loggedAt = System.currentTimeMillis(),
                rpe = rpe,
                section = section,
            )
        )
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

    /**
     * Every set already logged for one exercise on one day, keyed by set index.
     * Backs per-set restore when a workout card is reopened mid-session.
     */
    fun setsForExerciseOnDay(
        planId: String,
        dayKey: String,
        exerciseName: String,
    ): Map<Int, SetLog> {
        val target = exerciseName.trim().lowercase()
        return load()
            .filter {
                it.planId == planId &&
                    it.dayKey == dayKey &&
                    it.exerciseName.trim().lowercase() == target
            }
            .associateBy { it.setIndex }
    }

    /**
     * Weight and reps from the most recent session of this exercise, keyed by set index.
     * Prefilling from the matching set — rather than one weight for the whole exercise —
     * is what makes top-set-plus-backoff and drop-set patterns one tap to repeat.
     */
    fun lastSessionSets(exerciseName: String): Map<Int, SetLog> {
        val target = exerciseName.trim().lowercase()
        val matching = load().filter { it.exerciseName.trim().lowercase() == target }
        val latestDay = matching.maxByOrNull { it.loggedAt }?.dayKey ?: return emptyMap()
        return matching.filter { it.dayKey == latestDay }.associateBy { it.setIndex }
    }

    /** Removes a single set log — used when the user deletes an added set. */
    fun remove(planId: String, dayKey: String, exerciseName: String, setIndex: Int) {
        val id = logId(planId, dayKey, exerciseName, setIndex)
        save(load().filterNot { logId(it.planId, it.dayKey, it.exerciseName, it.setIndex) == id })
    }

    /**
     * All logs in the shared `WorkoutSetLogDto` shape the progression engine consumes.
     * `dayKey` is already an ISO date, so it maps straight onto `date`. Logs written before
     * RPE capture carry a null `rpe`, which the engine handles by falling back to plain Epley.
     */
    fun allLogsAsDto(): List<WorkoutSetLogDto> = load().map { entry ->
        WorkoutSetLogDto(
            id = logId(entry.planId, entry.dayKey, entry.exerciseName, entry.setIndex),
            date = entry.dayKey,
            planId = entry.planId,
            dayLabel = entry.dayKey,
            section = entry.section,
            exerciseName = entry.exerciseName,
            globalSlot = 0,
            setIndex = entry.setIndex,
            weightLbs = entry.weightLbs,
            reps = entry.reps,
            rpe = entry.rpe,
            loggedAt = java.time.Instant.ofEpochMilli(entry.loggedAt).toString(),
        )
    }

    fun volumeForDay(planId: String, dayKey: String): Double =
        logsForDay(planId, dayKey).sumOf { it.weightLbs * it.reps }

    companion object {
        private const val KEY = "logs_v1"
    }
}

/**
 * What the user actually performed on a single set, captured when they tap it complete.
 * Grouped into one type so the completion callback stays readable as fields are added.
 */
data class LoggedSet(
    val weightLbs: Double?,
    val reps: Int?,
    /** Rating of perceived exertion (6–10), or null when the user did not rate it. */
    val rpe: Double?,
    /** "warmup" | "main" | "finisher" — warmups are excluded from progression. */
    val section: String,
)

/** "8" rather than "8.0"; half-points stay as "8.5". */
fun formatRpe(value: Double): String =
    if (value == Math.floor(value)) value.toInt().toString() else String.format("%.1f", value)

/** Representative rep count parsed from a prescription string (first integer in e.g. "8-12"). */
fun parsePrescribedReps(reps: String): Int? =
    Regex("\\d+").find(reps)?.value?.toIntOrNull()
