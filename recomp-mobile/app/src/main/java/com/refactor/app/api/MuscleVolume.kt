package com.refactor.app.api

import com.refactor.app.api.dto.WorkoutExerciseDto
import com.refactor.app.api.dto.WorkoutSetLogDto
import java.time.LocalDate
import java.time.format.DateTimeParseException
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Weekly training volume per muscle group.
 *
 * Hard sets per muscle per week is the strongest single predictor of hypertrophy, and it is
 * the number lifters most often get wrong — chest and biceps drift high while hamstrings,
 * rear delts, and calves quietly starve. This counts what was actually logged and scores it
 * against volume landmarks (MEV / MAV / MRV).
 *
 * Mirrors web `src/lib/muscle-volume.ts` and iOS `MuscleVolume.swift`.
 */
object MuscleVolume {

    // ── Muscle groups ───────────────────────────────────

    enum class MuscleGroup {
        CHEST, BACK, SHOULDERS, BICEPS, TRICEPS,
        QUADS, HAMSTRINGS, GLUTES, CALVES, ABS, FOREARMS, TRAPS;

        /** Human-readable label, e.g. HAMSTRINGS → "Hamstrings". */
        val label: String
            get() = name.lowercase().replaceFirstChar { it.uppercase() }
    }

    data class Landmarks(val mev: Int, val mav: Int, val mrv: Int)

    /**
     * Weekly set landmarks per muscle group.
     *
     * - [Landmarks.mev] minimum effective volume: below this, expect maintenance at best.
     * - [Landmarks.mav] maximum adaptive volume: the productive middle most growth happens in.
     * - [Landmarks.mrv] maximum recoverable volume: past this, fatigue outruns adaptation.
     */
    val landmarks: Map<MuscleGroup, Landmarks> = mapOf(
        MuscleGroup.CHEST to Landmarks(8, 16, 22),
        MuscleGroup.BACK to Landmarks(10, 18, 25),
        MuscleGroup.SHOULDERS to Landmarks(8, 18, 26),
        MuscleGroup.BICEPS to Landmarks(8, 16, 26),
        MuscleGroup.TRICEPS to Landmarks(6, 14, 22),
        MuscleGroup.QUADS to Landmarks(8, 16, 20),
        MuscleGroup.HAMSTRINGS to Landmarks(6, 13, 20),
        MuscleGroup.GLUTES to Landmarks(4, 12, 16),
        MuscleGroup.CALVES to Landmarks(8, 16, 20),
        MuscleGroup.ABS to Landmarks(4, 16, 25),
        MuscleGroup.FOREARMS to Landmarks(2, 10, 16),
        MuscleGroup.TRAPS to Landmarks(4, 12, 20),
    )

    /** Beginners grow on less; advanced lifters need more before the same stimulus lands. */
    private val LEVEL_MULTIPLIER = mapOf(
        "beginner" to 0.7,
        "intermediate" to 1.0,
        "advanced" to 1.15,
        "athlete" to 1.15,
    )

    /** A secondary mover earns half credit — the convention used for hard-set counting. */
    private const val SECONDARY_CREDIT = 0.5

    // ── Classification ──────────────────────────────────

    /** ExerciseDB `targetMuscles` vocabulary → canonical groups. Unknown terms are dropped. */
    private val EXERCISEDB_ALIASES = mapOf(
        "pectorals" to MuscleGroup.CHEST,
        "serratus anterior" to MuscleGroup.CHEST,
        "lats" to MuscleGroup.BACK,
        "upper back" to MuscleGroup.BACK,
        "levator scapulae" to MuscleGroup.BACK,
        "spine" to MuscleGroup.BACK,
        "delts" to MuscleGroup.SHOULDERS,
        "deltoids" to MuscleGroup.SHOULDERS,
        "biceps" to MuscleGroup.BICEPS,
        "triceps" to MuscleGroup.TRICEPS,
        "quads" to MuscleGroup.QUADS,
        "quadriceps" to MuscleGroup.QUADS,
        "hamstrings" to MuscleGroup.HAMSTRINGS,
        "glutes" to MuscleGroup.GLUTES,
        "adductors" to MuscleGroup.QUADS,
        "abductors" to MuscleGroup.GLUTES,
        "calves" to MuscleGroup.CALVES,
        "abs" to MuscleGroup.ABS,
        "forearms" to MuscleGroup.FOREARMS,
        "traps" to MuscleGroup.TRAPS,
    )

    private data class NameRule(
        val tokens: List<String>,
        val primary: List<MuscleGroup>,
        val secondary: List<MuscleGroup> = emptyList(),
    )

    /**
     * Name-based classification for untagged exercises — which is most of them, since plans are
     * generated as free text. Ordered most specific first so "romanian deadlift" resolves to
     * hamstrings before "deadlift" claims it for back.
     */
    private val NAME_RULES = listOf(
        // Hinge / posterior chain — before generic deadlift
        NameRule(listOf("romanian", "rdl", "good morning", "stiff leg", "stiff-leg"), listOf(MuscleGroup.HAMSTRINGS), listOf(MuscleGroup.GLUTES, MuscleGroup.BACK)),
        NameRule(listOf("hip thrust", "glute bridge", "kickback"), listOf(MuscleGroup.GLUTES), listOf(MuscleGroup.HAMSTRINGS)),
        NameRule(listOf("leg curl", "nordic", "ham curl"), listOf(MuscleGroup.HAMSTRINGS)),
        NameRule(listOf("deadlift"), listOf(MuscleGroup.BACK, MuscleGroup.HAMSTRINGS), listOf(MuscleGroup.GLUTES, MuscleGroup.TRAPS, MuscleGroup.FOREARMS)),

        // Squat pattern
        NameRule(listOf("leg press", "hack squat"), listOf(MuscleGroup.QUADS), listOf(MuscleGroup.GLUTES)),
        NameRule(listOf("leg extension"), listOf(MuscleGroup.QUADS)),
        NameRule(listOf("lunge", "split squat", "step up", "step-up", "bulgarian"), listOf(MuscleGroup.QUADS, MuscleGroup.GLUTES), listOf(MuscleGroup.HAMSTRINGS)),
        NameRule(listOf("squat"), listOf(MuscleGroup.QUADS), listOf(MuscleGroup.GLUTES, MuscleGroup.HAMSTRINGS)),

        // Vertical / horizontal pull
        NameRule(listOf("pull up", "pull-up", "pullup", "chin up", "chin-up", "chinup", "pulldown"), listOf(MuscleGroup.BACK), listOf(MuscleGroup.BICEPS)),
        NameRule(listOf("face pull", "rear delt", "reverse fly", "reverse flye"), listOf(MuscleGroup.SHOULDERS), listOf(MuscleGroup.BACK)),
        NameRule(listOf("row"), listOf(MuscleGroup.BACK), listOf(MuscleGroup.BICEPS, MuscleGroup.TRAPS)),
        NameRule(listOf("pullover"), listOf(MuscleGroup.BACK), listOf(MuscleGroup.CHEST)),
        NameRule(listOf("shrug"), listOf(MuscleGroup.TRAPS), listOf(MuscleGroup.FOREARMS)),

        // Press / push
        NameRule(listOf("overhead press", "shoulder press", "military press", "arnold press", "push press"), listOf(MuscleGroup.SHOULDERS), listOf(MuscleGroup.TRICEPS)),
        NameRule(listOf("lateral raise", "side raise", "front raise"), listOf(MuscleGroup.SHOULDERS)),
        NameRule(listOf("incline bench", "incline press", "incline dumbbell"), listOf(MuscleGroup.CHEST), listOf(MuscleGroup.SHOULDERS, MuscleGroup.TRICEPS)),
        NameRule(listOf("bench press", "chest press", "push up", "push-up", "pushup", "dip"), listOf(MuscleGroup.CHEST), listOf(MuscleGroup.TRICEPS, MuscleGroup.SHOULDERS)),
        NameRule(listOf("fly", "flye", "pec deck", "cable crossover"), listOf(MuscleGroup.CHEST)),

        // Arms
        NameRule(listOf("skullcrusher", "skull crusher", "pushdown", "tricep", "overhead extension"), listOf(MuscleGroup.TRICEPS)),
        NameRule(listOf("hammer curl", "preacher curl", "bicep curl", "curl"), listOf(MuscleGroup.BICEPS), listOf(MuscleGroup.FOREARMS)),
        NameRule(listOf("wrist curl", "farmer", "grip"), listOf(MuscleGroup.FOREARMS)),

        // Core / calves
        NameRule(listOf("calf", "calve"), listOf(MuscleGroup.CALVES)),
        NameRule(listOf("plank", "crunch", "sit up", "sit-up", "situp", "leg raise", "hanging", "russian twist", "ab wheel", "dead bug", "hollow"), listOf(MuscleGroup.ABS)),
    )

    data class Attribution(
        val primary: List<MuscleGroup>,
        val secondary: List<MuscleGroup>,
    )

    /** Map tagged muscle strings (ExerciseDB vocabulary) onto canonical groups. */
    fun normalizeTaggedMuscles(muscles: List<String>?): List<MuscleGroup> {
        if (muscles.isNullOrEmpty()) return emptyList()
        val seen = LinkedHashSet<MuscleGroup>()
        for (raw in muscles) {
            val key = raw.trim().lowercase()
            val mapped = EXERCISEDB_ALIASES[key]
                ?: MuscleGroup.entries.firstOrNull { it.name.lowercase() == key }
            if (mapped != null) seen.add(mapped)
        }
        return seen.toList()
    }

    /**
     * Which muscles an exercise trains. Prefers tagged muscles; otherwise matches the name.
     * Returns empty when nothing matches, so unknown movements are excluded rather than
     * misattributed.
     */
    fun classify(exerciseName: String, taggedMuscles: List<String>? = null): Attribution {
        val tagged = normalizeTaggedMuscles(taggedMuscles)
        if (tagged.isNotEmpty()) {
            return Attribution(listOf(tagged.first()), tagged.drop(1))
        }

        val name = exerciseName.trim().lowercase()
        if (name.isEmpty()) return Attribution(emptyList(), emptyList())

        for (rule in NAME_RULES) {
            if (rule.tokens.any { name.contains(it) }) {
                return Attribution(rule.primary, rule.secondary)
            }
        }
        return Attribution(emptyList(), emptyList())
    }

    // ── Weekly volume ───────────────────────────────────

    enum class Status { UNDER, OPTIMAL, HIGH, OVER }

    data class Entry(
        val muscle: MuscleGroup,
        /** Hard sets, primary at full credit and secondary at half. */
        val sets: Double,
        val landmarks: Landmarks,
        val status: Status,
        /** Sets to reach MEV; 0 when already at or above it. */
        val setsToMev: Int,
    )

    data class Summary(
        val weekStart: String,
        val entries: List<Entry>,
        /** Groups below MEV — the actionable list. */
        val underdosed: List<MuscleGroup>,
        /** Groups above MRV — recoverability risk. */
        val overdosed: List<MuscleGroup>,
        val totalHardSets: Int,
        /** Exercise names that could not be classified, so gaps are explainable. */
        val unclassifiedExercises: List<String>,
    )

    private fun scaled(l: Landmarks, fitnessLevel: String?): Landmarks {
        val multiplier = LEVEL_MULTIPLIER[fitnessLevel ?: "intermediate"] ?: 1.0
        if (multiplier == 1.0) return l
        return Landmarks(
            mev = (l.mev * multiplier).roundToInt(),
            mav = (l.mav * multiplier).roundToInt(),
            mrv = (l.mrv * multiplier).roundToInt(),
        )
    }

    private fun statusFor(sets: Double, l: Landmarks): Status = when {
        sets < l.mev -> Status.UNDER
        sets > l.mrv -> Status.OVER
        sets > l.mav -> Status.HIGH
        else -> Status.OPTIMAL
    }

    private fun makeEntries(
        totals: Map<MuscleGroup, Double>,
        fitnessLevel: String?,
    ): List<Entry> = MuscleGroup.entries.map { muscle ->
        val sets = Math.round((totals[muscle] ?: 0.0) * 2) / 2.0
        val l = scaled(landmarks[muscle] ?: Landmarks(0, 0, 0), fitnessLevel)
        Entry(
            muscle = muscle,
            sets = sets,
            landmarks = l,
            status = statusFor(sets, l),
            setsToMev = max(0.0, ceil(l.mev - sets)).toInt(),
        )
    }

    /**
     * Count hard sets per muscle across a 7-day window starting at [weekStart].
     * Warmup sets are excluded; a set counts once it has reps logged.
     */
    fun computeWeekly(
        setLogs: List<WorkoutSetLogDto>,
        weekStart: String,
        fitnessLevel: String? = null,
        muscleLookup: Map<String, List<String>> = emptyMap(),
    ): Summary {
        val start = try {
            LocalDate.parse(weekStart)
        } catch (_: DateTimeParseException) {
            return Summary(weekStart, makeEntries(emptyMap(), fitnessLevel), emptyList(), emptyList(), 0, emptyList())
        }
        val end = start.plusDays(7)

        val totals = LinkedHashMap<MuscleGroup, Double>()
        val unclassified = LinkedHashSet<String>()
        var totalHardSets = 0

        for (entry in setLogs) {
            if (entry.section == "warmup") continue
            val reps = entry.reps ?: continue
            if (reps <= 0) continue

            val date = try { LocalDate.parse(entry.date) } catch (_: DateTimeParseException) { continue }
            if (date.isBefore(start) || !date.isBefore(end)) continue

            totalHardSets += 1

            val key = entry.exerciseName.trim().lowercase()
            val attribution = classify(entry.exerciseName, muscleLookup[key])

            if (attribution.primary.isEmpty()) {
                unclassified.add(entry.exerciseName.trim())
                continue
            }
            for (muscle in attribution.primary) {
                totals[muscle] = (totals[muscle] ?: 0.0) + 1.0
            }
            for (muscle in attribution.secondary) {
                totals[muscle] = (totals[muscle] ?: 0.0) + SECONDARY_CREDIT
            }
        }

        val entries = makeEntries(totals, fitnessLevel)
        return Summary(
            weekStart = weekStart,
            entries = entries,
            underdosed = entries.filter { it.status == Status.UNDER }.map { it.muscle },
            overdosed = entries.filter { it.status == Status.OVER }.map { it.muscle },
            totalHardSets = totalHardSets,
            unclassifiedExercises = unclassified.toList(),
        )
    }

    /**
     * Planned weekly volume from the program itself, before anything is logged.
     * Lets the app flag an unbalanced plan on day one rather than four weeks in.
     */
    fun computePlanned(
        exercisesByDay: List<List<WorkoutExerciseDto>>,
        fitnessLevel: String? = null,
    ): List<Entry> {
        val totals = LinkedHashMap<MuscleGroup, Double>()

        for (day in exercisesByDay) {
            for (exercise in day) {
                val setCount = Progression.parseSetTarget(exercise.sets).toDouble()
                val attribution = classify(exercise.name, exercise.muscles)
                for (muscle in attribution.primary) {
                    totals[muscle] = (totals[muscle] ?: 0.0) + setCount
                }
                for (muscle in attribution.secondary) {
                    totals[muscle] = (totals[muscle] ?: 0.0) + setCount * SECONDARY_CREDIT
                }
            }
        }

        return makeEntries(totals, fitnessLevel)
    }
}
