package com.refactor.app.api

import com.refactor.app.api.dto.WorkoutExerciseDto
import com.refactor.app.api.dto.WorkoutSetLogDto
import java.time.LocalDate
import java.time.format.DateTimeParseException
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Deterministic progressive-overload engine.
 *
 * Turns logged sets (weight/reps/RPE) into a strength trend per exercise and a concrete
 * prescription for the next session — "squat 195 x 5" rather than "try to go a bit heavier".
 * No model calls: every output is reproducible math, so the coach explains numbers instead
 * of inventing them.
 *
 * Mirrors web `src/lib/progression.ts` and iOS `Progression.swift`. Keep the three in sync —
 * the tunables and branch order must match exactly.
 */
object Progression {

    // ── Tunables ────────────────────────────────────────

    /** Reps beyond this make e1RM estimates unreliable; we flag low confidence. */
    private const val MAX_RELIABLE_REPS = 12
    /** RPE at or below this on a top set means there was room to spare → earn load. */
    private const val OVERLOAD_RPE_CEILING = 8.0
    /** RPE at or above this means the set was a grind → hold rather than push. */
    private const val GRIND_RPE = 9.5
    /** Sessions without an e1RM improvement before we call it a stall. */
    private const val STALL_SESSION_THRESHOLD = 3
    /** Load cut applied when deloading a stalled lift. */
    private const val DELOAD_FRACTION = 0.9
    /** Readiness score below this suppresses load increases. */
    private const val LOW_READINESS = 60.0

    // ── Types ───────────────────────────────────────────

    data class RepRange(val min: Int, val max: Int)

    data class ExerciseSessionPoint(
        val date: String,
        /** Best estimated 1RM across all sets logged that session. */
        val bestE1rm: Double,
        val topSetWeightLbs: Double?,
        val topSetReps: Int?,
        val topSetRpe: Double?,
        val totalVolumeLbs: Double,
        val workingSets: Int,
    )

    enum class Trend { CLIMBING, FLAT, DECLINING, INSUFFICIENT_DATA }

    data class ExerciseProgression(
        val exerciseName: String,
        /** Chronological, one entry per session that produced a usable e1RM. */
        val sessions: List<ExerciseSessionPoint>,
        val currentE1rm: Double,
        val bestE1rm: Double,
        val bestE1rmDate: String?,
        val changePct: Double,
        val trend: Trend,
        /** Sessions logged since the all-time best — the stall counter. */
        val sessionsSinceBest: Int,
        val stalled: Boolean,
    )

    enum class Action(val displayLabel: String) {
        ESTABLISH_BASELINE("Baseline"),
        ADD_LOAD("Add load"),
        ADD_REPS("Add reps"),
        HOLD("Hold"),
        DELOAD("Deload"),
    }

    enum class Confidence { HIGH, MEDIUM, LOW }

    data class Previous(
        val date: String,
        val weightLbs: Double?,
        val reps: Int?,
        val rpe: Double?,
    )

    data class SetPrescription(
        val exerciseName: String,
        val action: Action,
        val targetSets: Int,
        val targetReps: Int,
        val targetRepsMax: Int?,
        val targetWeightLbs: Double?,
        val targetRpe: Double?,
        /** Human-readable "why", shown in the UI and handed to the coach verbatim. */
        val rationale: String,
        val confidence: Confidence,
        val previous: Previous?,
    ) {
        /** e.g. `"190 lb × 8"`, or null for bodyweight/timed work. */
        val targetDisplay: String?
            get() = targetWeightLbs?.let { "${describeWeight(it)} lb × $targetReps" }
    }

    data class Options(
        val readinessScore: Double? = null,
        /** Multiplier on prescribed load, e.g. 0.9 during a deload week. From [Mesocycle]. */
        val intensityMultiplier: Double = 1.0,
        /** Multiplier on prescribed sets, e.g. 0.5 during a deload week. From [Mesocycle]. */
        val volumeMultiplier: Double = 1.0,
        val today: String? = null,
    )

    // ── e1RM ────────────────────────────────────────────

    /**
     * Epley estimated 1RM, RIR-adjusted when RPE is known.
     *
     * A set of 8 @ RPE 8 had ~2 reps in reserve, so it reflects the same strength as a set of
     * 10 taken to failure. Folding that in makes submaximal work comparable across sessions.
     */
    fun estimateOneRepMax(weightLbs: Double, reps: Int, rpe: Double? = null): Double {
        if (weightLbs <= 0 || reps <= 0) return 0.0
        val repsInReserve = if (rpe != null && rpe > 0 && rpe <= 10) max(0.0, 10 - rpe) else 0.0
        val effectiveReps = reps + repsInReserve
        return weightLbs * (1 + effectiveReps / 30)
    }

    /** Load that should permit [reps] at the given e1RM (inverse Epley). */
    fun loadForReps(e1rm: Double, reps: Int): Double {
        if (e1rm <= 0 || reps <= 0) return 0.0
        return e1rm / (1 + reps / 30.0)
    }

    // ── Parsing prescribed work ─────────────────────────

    /** `"8-12"` → 8..12; `"10"` → 10..10. Null for time/AMRAP work. */
    fun parseRepRange(reps: String?): RepRange? {
        if (reps == null) return null
        val cleaned = reps.lowercase()
        if (listOf("sec", "min", "amrap", "max", "failure").any { cleaned.contains(it) }) return null
        val numbers = matchIntegers(cleaned)
        val first = numbers.firstOrNull() ?: return null
        if (first <= 0) return null
        val second = if (numbers.size > 1) numbers[1] else first
        return RepRange(first, max(first, second))
    }

    /** `"3-4 sets"` / `"4"` → 4. Defaults to 3 when unparseable. */
    fun parseSetTarget(sets: String?): Int {
        if (sets == null) return 3
        val last = matchIntegers(sets).lastOrNull() ?: return 3
        return min(max(last, 1), 10)
    }

    private fun matchIntegers(text: String): List<Int> =
        Regex("\\d+").findAll(text).mapNotNull { it.value.toIntOrNull() }.toList()

    // ── Load increments ─────────────────────────────────

    private val LOWER_BODY_TOKENS = listOf(
        "squat", "deadlift", "leg press", "hip thrust", "lunge", "romanian", "rdl",
        "hack", "good morning", "split squat", "step-up", "step up", "calf",
    )
    private val DUMBBELL_TOKENS = listOf("dumbbell", "db ", "kettlebell", "kb ")
    private val ISOLATION_TOKENS = listOf(
        "curl", "raise", "fly", "flye", "extension", "pushdown", "pullover",
        "shrug", "face pull", "rear delt", "kickback",
    )

    /**
     * Smallest sensible jump for this lift. Big compound lower-body movements absorb 10 lb;
     * isolation work stalls out if you add more than 2.5.
     */
    fun loadIncrementLbs(exerciseName: String): Double {
        val name = exerciseName.lowercase()
        if (ISOLATION_TOKENS.any { name.contains(it) }) return 2.5
        if (DUMBBELL_TOKENS.any { name.contains(it) }) return 5.0
        if (LOWER_BODY_TOKENS.any { name.contains(it) }) return 10.0
        return 5.0
    }

    /** Round to a loadable weight (2.5 lb granularity on the smallest jumps). */
    fun roundToLoadable(weightLbs: Double, incrementLbs: Double): Double {
        val granularity = if (incrementLbs <= 2.5) 2.5 else 5.0
        return (weightLbs / granularity).roundToInt() * granularity
    }

    private fun describeWeight(weight: Double): String =
        if (weight == Math.floor(weight)) weight.toInt().toString() else String.format("%.1f", weight)

    // ── Building the trend ──────────────────────────────

    private fun normalize(name: String): String = name.trim().lowercase()

    /** Collapse one exercise's logs into one point per session, keyed by date. */
    fun buildExerciseProgression(
        logs: List<WorkoutSetLogDto>,
        exerciseName: String,
    ): ExerciseProgression {
        val key = normalize(exerciseName)
        val relevant = logs.filter { normalize(it.exerciseName) == key && it.section != "warmup" }

        val sessions = relevant.groupBy { it.date }.mapNotNull { (date, dayLogs) ->
            var bestE1rm = 0.0
            var topWeight: Double? = null
            var topReps: Int? = null
            var topRpe: Double? = null
            var volume = 0.0
            var workingSets = 0

            for (logEntry in dayLogs) {
                val weight = logEntry.weightLbs ?: continue
                val reps = logEntry.reps ?: continue
                workingSets += 1
                volume += weight * reps
                val e1rm = estimateOneRepMax(weight, reps, logEntry.rpe)
                if (e1rm > bestE1rm) {
                    bestE1rm = e1rm
                    topWeight = weight
                    topReps = reps
                    topRpe = logEntry.rpe
                }
            }

            if (bestE1rm <= 0) null
            else ExerciseSessionPoint(
                date = date,
                bestE1rm = Math.round(bestE1rm * 10) / 10.0,
                topSetWeightLbs = topWeight,
                topSetReps = topReps,
                topSetRpe = topRpe,
                totalVolumeLbs = Math.round(volume).toDouble(),
                workingSets = workingSets,
            )
        }.sortedBy { it.date }

        val last = sessions.lastOrNull()
        val first = sessions.firstOrNull()
        if (last == null || first == null) {
            return ExerciseProgression(
                exerciseName = exerciseName, sessions = emptyList(), currentE1rm = 0.0,
                bestE1rm = 0.0, bestE1rmDate = null, changePct = 0.0,
                trend = Trend.INSUFFICIENT_DATA, sessionsSinceBest = 0, stalled = false,
            )
        }

        val currentE1rm = last.bestE1rm
        var bestE1rm = 0.0
        var bestIndex = 0
        sessions.forEachIndexed { index, session ->
            if (session.bestE1rm > bestE1rm) {
                bestE1rm = session.bestE1rm
                bestIndex = index
            }
        }

        val changePct =
            if (first.bestE1rm > 0) ((currentE1rm - first.bestE1rm) / first.bestE1rm) * 100 else 0.0
        val sessionsSinceBest = sessions.size - 1 - bestIndex

        val trend = when {
            sessions.size < 2 -> Trend.INSUFFICIENT_DATA
            changePct >= 2 -> Trend.CLIMBING
            changePct <= -3 -> Trend.DECLINING
            else -> Trend.FLAT
        }

        return ExerciseProgression(
            exerciseName = relevant.firstOrNull()?.exerciseName ?: exerciseName,
            sessions = sessions,
            currentE1rm = currentE1rm,
            bestE1rm = bestE1rm,
            bestE1rmDate = sessions[bestIndex].date,
            changePct = Math.round(changePct * 10) / 10.0,
            trend = trend,
            sessionsSinceBest = sessionsSinceBest,
            stalled = sessionsSinceBest >= STALL_SESSION_THRESHOLD,
        )
    }

    /** One progression per distinct non-warmup exercise present in the logs. */
    fun buildAllProgressions(logs: List<WorkoutSetLogDto>): List<ExerciseProgression> {
        val names = LinkedHashMap<String, String>()
        for (logEntry in logs) {
            if (logEntry.section == "warmup") continue
            val key = normalize(logEntry.exerciseName)
            if (key.isNotEmpty() && !names.containsKey(key)) names[key] = logEntry.exerciseName
        }
        return names.values
            .map { buildExerciseProgression(logs, it) }
            .filter { it.sessions.isNotEmpty() }
            .sortedByDescending { it.currentE1rm }
    }

    // ── Prescription ────────────────────────────────────

    /**
     * Double progression with RPE autoregulation.
     *
     * Hit the top of the rep range with reps to spare → add load and reset to the bottom of
     * the range. Otherwise add a rep. Grind sets hold, stalls deload.
     */
    fun prescribeNextSession(
        exercise: WorkoutExerciseDto,
        progression: ExerciseProgression?,
        options: Options = Options(),
    ): SetPrescription {
        // Never scale below one working set — a deload is less work, not no work.
        val targetSets = if (options.volumeMultiplier == 1.0) {
            parseSetTarget(exercise.sets)
        } else {
            max(1, (parseSetTarget(exercise.sets) * options.volumeMultiplier).roundToInt())
        }
        val range = parseRepRange(exercise.reps)

        // Bodyweight / timed work has no load to prescribe.
        if (range == null) {
            return SetPrescription(
                exerciseName = exercise.name, action = Action.HOLD, targetSets = targetSets,
                targetReps = 0, targetRepsMax = null, targetWeightLbs = null, targetRpe = null,
                rationale = "Perform as prescribed (${exercise.reps}).",
                confidence = Confidence.LOW, previous = null,
            )
        }

        val last = progression?.sessions?.lastOrNull()
        val lastWeight = last?.topSetWeightLbs
        if (progression == null || last == null || lastWeight == null) {
            return SetPrescription(
                exerciseName = exercise.name, action = Action.ESTABLISH_BASELINE,
                targetSets = targetSets, targetReps = range.min, targetRepsMax = range.max,
                targetWeightLbs = null, targetRpe = OVERLOAD_RPE_CEILING,
                rationale = "First tracked session — pick a weight you can take to ${range.max} reps at RPE ${OVERLOAD_RPE_CEILING.toInt()}, then log it. That becomes your baseline.",
                confidence = Confidence.LOW, previous = null,
            )
        }

        val lastReps = last.topSetReps ?: 0
        val lastRpe = last.topSetRpe
        val increment = loadIncrementLbs(exercise.name)
        val previous = Previous(last.date, lastWeight, lastReps, lastRpe)
        val confidence = when {
            lastReps > MAX_RELIABLE_REPS -> Confidence.LOW
            progression.sessions.size >= 3 -> Confidence.HIGH
            else -> Confidence.MEDIUM
        }

        fun applyMultiplier(weight: Double): Double =
            if (options.intensityMultiplier == 1.0) weight
            else roundToLoadable(weight * options.intensityMultiplier, increment)

        // 1. Stalled → deload to break the plateau.
        if (progression.stalled) {
            val target = roundToLoadable(lastWeight * DELOAD_FRACTION, increment)
            return SetPrescription(
                exerciseName = exercise.name, action = Action.DELOAD, targetSets = targetSets,
                targetReps = range.min, targetRepsMax = range.max,
                targetWeightLbs = applyMultiplier(target), targetRpe = 7.0,
                rationale = "No e1RM progress in ${progression.sessionsSinceBest} sessions. Drop to ${describeWeight(target)} lb (−10%) and rebuild — plateaus break by backing off, not grinding.",
                confidence = confidence, previous = previous,
            )
        }

        // 2. Low readiness → hold load, keep the session productive but not costly.
        val readiness = options.readinessScore
        if (readiness != null && readiness < LOW_READINESS) {
            return SetPrescription(
                exerciseName = exercise.name, action = Action.HOLD, targetSets = targetSets,
                targetReps = range.min, targetRepsMax = range.max,
                targetWeightLbs = applyMultiplier(lastWeight), targetRpe = 7.0,
                rationale = "Recovery is at ${Math.round(readiness)}/100. Repeat ${describeWeight(lastWeight)} lb and stop 2 reps shy — hold ground today, push when you're recovered.",
                confidence = confidence, previous = previous,
            )
        }

        // 3. Last set was a grind → repeat it before adding anything.
        if (lastRpe != null && lastRpe >= GRIND_RPE && lastReps < range.max) {
            return SetPrescription(
                exerciseName = exercise.name, action = Action.HOLD, targetSets = targetSets,
                targetReps = min(lastReps + 1, range.max), targetRepsMax = range.max,
                targetWeightLbs = applyMultiplier(lastWeight),
                targetRpe = OVERLOAD_RPE_CEILING + 1,
                rationale = "Last set hit RPE ${describeWeight(lastRpe)}. Stay at ${describeWeight(lastWeight)} lb until it moves cleaner, then add load.",
                confidence = confidence, previous = previous,
            )
        }

        // 4. Topped out the rep range with reps to spare → add load, reset reps.
        val earnedLoad = lastReps >= range.max && (lastRpe == null || lastRpe <= OVERLOAD_RPE_CEILING)
        if (earnedLoad) {
            val target = roundToLoadable(lastWeight + increment, increment)
            val rpeNote = lastRpe?.let { " (RPE ${describeWeight(it)})" } ?: ""
            return SetPrescription(
                exerciseName = exercise.name, action = Action.ADD_LOAD, targetSets = targetSets,
                targetReps = range.min, targetRepsMax = range.max,
                targetWeightLbs = applyMultiplier(target), targetRpe = OVERLOAD_RPE_CEILING,
                rationale = "You hit $lastReps reps at ${describeWeight(lastWeight)} lb$rpeNote — that earned the jump. Go ${describeWeight(target)} lb for ${range.min} and climb back up the range.",
                confidence = confidence, previous = previous,
            )
        }

        // 5. Otherwise add a rep at the same load.
        val nextReps = min(lastReps + 1, range.max)
        return SetPrescription(
            exerciseName = exercise.name, action = Action.ADD_REPS, targetSets = targetSets,
            targetReps = nextReps, targetRepsMax = range.max,
            targetWeightLbs = applyMultiplier(lastWeight), targetRpe = OVERLOAD_RPE_CEILING,
            rationale = "Last time: ${describeWeight(lastWeight)} lb × $lastReps. Same weight, chase $nextReps reps. At ${range.max} you earn the next jump.",
            confidence = confidence, previous = previous,
        )
    }

    /** Prescriptions for every main/finisher movement in a day, keyed by normalized name. */
    fun prescribeWorkoutDay(
        exercises: List<WorkoutExerciseDto>,
        logs: List<WorkoutSetLogDto>,
        options: Options = Options(),
    ): Map<String, SetPrescription> {
        val result = LinkedHashMap<String, SetPrescription>()
        for (exercise in exercises) {
            val key = normalize(exercise.name)
            if (key.isEmpty() || result.containsKey(key)) continue
            result[key] = prescribeNextSession(
                exercise = exercise,
                progression = buildExerciseProgression(logs, exercise.name),
                options = options,
            )
        }
        return result
    }

    // ── Coach-facing summary ────────────────────────────

    data class TopGain(val exerciseName: String, val changePct: Double, val currentE1rm: Double)
    data class RecentPr(val exerciseName: String, val e1rm: Double, val date: String)

    data class Summary(
        val trackedExercises: Int,
        val climbing: List<String>,
        val stalled: List<String>,
        val topGains: List<TopGain>,
        val recentPrs: List<RecentPr>,
    )

    fun summarize(
        progressions: List<ExerciseProgression>,
        recentDays: Long = 14,
        today: String = LocalDate.now().toString(),
    ): Summary {
        val cutoff = try {
            LocalDate.parse(today).minusDays(recentDays)
        } catch (_: DateTimeParseException) {
            LocalDate.now().minusDays(recentDays)
        }

        val climbing = mutableListOf<String>()
        val stalled = mutableListOf<String>()
        val recentPrs = mutableListOf<RecentPr>()

        for (progression in progressions) {
            if (progression.trend == Trend.CLIMBING) climbing.add(progression.exerciseName)
            if (progression.stalled) stalled.add(progression.exerciseName)
            val prDate = progression.bestE1rmDate
            if (prDate != null && progression.sessions.size > 1) {
                val parsed = try { LocalDate.parse(prDate) } catch (_: DateTimeParseException) { null }
                if (parsed != null && !parsed.isBefore(cutoff)) {
                    recentPrs.add(
                        RecentPr(
                            progression.exerciseName,
                            Math.round(progression.bestE1rm).toDouble(),
                            prDate,
                        )
                    )
                }
            }
        }

        val topGains = progressions
            .filter { it.sessions.size >= 2 }
            .sortedByDescending { it.changePct }
            .take(5)
            .map { TopGain(it.exerciseName, it.changePct, Math.round(it.currentE1rm).toDouble()) }

        return Summary(
            trackedExercises = progressions.size,
            climbing = climbing,
            stalled = stalled,
            topGains = topGains,
            recentPrs = recentPrs.sortedByDescending { it.date },
        )
    }
}
