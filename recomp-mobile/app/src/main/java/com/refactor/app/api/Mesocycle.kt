package com.refactor.app.api

import com.refactor.app.api.dto.WorkoutSetLogDto
import java.time.LocalDate
import java.time.format.DateTimeParseException
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Mesocycle periodization and fatigue-driven deloads.
 *
 * A 12-week program that repeats week 1 twelve times is where transformations stall around
 * week five: volume never ramps, fatigue never gets cleared, and the lifter grinds until
 * something hurts. This gives the program a shape — volume climbing across a block, a peak
 * week, then a deload — and watches real fatigue signals so the deload can arrive early when
 * the body asks for it.
 *
 * Mirrors web `src/lib/mesocycle.ts` and iOS `Mesocycle.swift`.
 */
object Mesocycle {

    // ── Tunables ────────────────────────────────────────

    /** Weeks per block, including the trailing deload. */
    const val DEFAULT_BLOCK_LENGTH = 5
    private const val MIN_BLOCK_LENGTH = 3
    private const val MAX_BLOCK_LENGTH = 8

    /** Volume ramp across accumulation weeks. */
    private const val RAMP_START = 0.85
    private const val RAMP_END = 1.15
    /** Peak week: volume backs off slightly so intensity can rise. */
    private const val PEAK_VOLUME = 1.0
    private const val PEAK_INTENSITY = 1.03
    /** Deload: half the work at 90% of the load. */
    private const val DELOAD_VOLUME = 0.5
    private const val DELOAD_INTENSITY = 0.9

    /** Fatigue score at or above this means deload now. */
    private const val DELOAD_NOW_SCORE = 50
    /** Below `now` but at or above this means deload is coming. */
    private const val DELOAD_SOON_SCORE = 30

    // ── Types ───────────────────────────────────────────

    enum class Phase(val label: String) {
        ACCUMULATION("Accumulation"),
        PEAK("Peak"),
        DELOAD("Deload"),
    }

    data class State(
        /** 1-based week within the current block. */
        val weekInBlock: Int,
        val blockLength: Int,
        /** 1-based block number since the program started. */
        val blockNumber: Int,
        val phase: Phase,
        /** Multiplier on prescribed sets this week. */
        val volumeMultiplier: Double,
        /** Multiplier on prescribed load this week. Feeds [Progression.Options.intensityMultiplier]. */
        val intensityMultiplier: Double,
        /** One-line explanation for the UI and the coach. */
        val summary: String,
    )

    data class FatigueSignals(
        /** Lifts with no e1RM progress for 3+ sessions. */
        val stalledLifts: Int = 0,
        /** Change in average top-set RPE, recent window vs the one before it. */
        val rpeCreep: Double = 0.0,
        /** Muscle groups logged past their maximum recoverable volume. */
        val musclesOverMrv: Int = 0,
        /** 0-100 recovery score, when a wearable supplies one. */
        val readinessScore: Double? = null,
        /** Sessions missed in the last 7 days. */
        val missedSessions: Int = 0,
    )

    enum class DeloadUrgency { NONE, SOON, NOW }

    data class DeloadRecommendation(
        val shouldDeload: Boolean,
        val urgency: DeloadUrgency,
        /** Weighted fatigue score, 0-100. */
        val score: Int,
        /** Plain-language reasons, most significant first. */
        val reasons: List<String>,
    )

    data class Resolution(
        val state: State,
        val deload: DeloadRecommendation,
        val deloadForced: Boolean,
    )

    // ── Block position ──────────────────────────────────

    fun clampBlockLength(weeks: Int?): Int {
        if (weeks == null) return DEFAULT_BLOCK_LENGTH
        return min(MAX_BLOCK_LENGTH, max(MIN_BLOCK_LENGTH, weeks))
    }

    /**
     * Where a given program week sits inside its block. [programWeek] is 1-based and
     * continuous across the whole program.
     */
    fun blockPosition(programWeek: Int, blockLength: Int = DEFAULT_BLOCK_LENGTH): Pair<Int, Int> {
        val length = clampBlockLength(blockLength)
        val zeroBased = max(1, programWeek) - 1
        return Pair(zeroBased % length + 1, zeroBased / length + 1)
    }

    /**
     * The training shape for a week: accumulation weeks ramp volume, the second-to-last week
     * peaks intensity, and the final week deloads to clear accumulated fatigue.
     */
    fun state(programWeek: Int, blockLength: Int = DEFAULT_BLOCK_LENGTH): State {
        val length = clampBlockLength(blockLength)
        val (weekInBlock, blockNumber) = blockPosition(programWeek, length)

        if (weekInBlock == length) {
            return State(
                weekInBlock = weekInBlock,
                blockLength = length,
                blockNumber = blockNumber,
                phase = Phase.DELOAD,
                volumeMultiplier = DELOAD_VOLUME,
                intensityMultiplier = DELOAD_INTENSITY,
                summary = "Deload week — half the sets at 90% load. This is where the last ${length - 1} weeks turn into adaptation.",
            )
        }

        // Peak week only exists in blocks long enough to have built something worth peaking.
        if (length >= 4 && weekInBlock == length - 1) {
            return State(
                weekInBlock = weekInBlock,
                blockLength = length,
                blockNumber = blockNumber,
                phase = Phase.PEAK,
                volumeMultiplier = PEAK_VOLUME,
                intensityMultiplier = PEAK_INTENSITY,
                summary = "Peak week — volume eases back so you can push the heaviest loads of the block.",
            )
        }

        // Ramp across the accumulation weeks that precede the peak.
        val accumulationWeeks = max(1, length - if (length >= 4) 2 else 1)
        val step = if (accumulationWeeks > 1) (RAMP_END - RAMP_START) / (accumulationWeeks - 1) else 0.0
        val volumeMultiplier = Math.round((RAMP_START + step * (weekInBlock - 1)) * 100) / 100.0

        return State(
            weekInBlock = weekInBlock,
            blockLength = length,
            blockNumber = blockNumber,
            phase = Phase.ACCUMULATION,
            volumeMultiplier = volumeMultiplier,
            intensityMultiplier = 1.0,
            summary = "Accumulation week $weekInBlock of $length — volume climbing toward the peak.",
        )
    }

    // ── Fatigue detection ───────────────────────────────

    /**
     * Change in average top-set RPE between the two most recent windows.
     *
     * Rising RPE at the same loads is the earliest honest signal that fatigue is outpacing
     * recovery — it shows up before the bar speed drops and well before a lift stalls outright.
     */
    fun rpeCreep(
        setLogs: List<WorkoutSetLogDto>,
        windowDays: Long = 7,
        today: String = LocalDate.now().toString(),
    ): Double {
        val end = try { LocalDate.parse(today) } catch (_: DateTimeParseException) { return 0.0 }
        val midpoint = end.minusDays(windowDays)
        val start = end.minusDays(windowDays * 2)

        val recent = mutableListOf<Double>()
        val prior = mutableListOf<Double>()

        for (entry in setLogs) {
            if (entry.section == "warmup") continue
            val rpe = entry.rpe ?: continue
            val date = try { LocalDate.parse(entry.date) } catch (_: DateTimeParseException) { continue }
            if (date.isAfter(end)) continue
            if (date.isAfter(midpoint)) recent.add(rpe)
            else if (date.isAfter(start)) prior.add(rpe)
        }

        if (recent.isEmpty() || prior.isEmpty()) return 0.0
        return Math.round((recent.average() - prior.average()) * 100) / 100.0
    }

    /** Gather the signals a deload decision rests on. */
    fun buildFatigueSignals(
        progressions: List<Progression.ExerciseProgression>,
        setLogs: List<WorkoutSetLogDto>,
        musclesOverMrv: Int = 0,
        readinessScore: Double? = null,
        missedSessions: Int = 0,
        today: String = LocalDate.now().toString(),
    ): FatigueSignals = FatigueSignals(
        stalledLifts = progressions.count { it.stalled },
        rpeCreep = rpeCreep(setLogs, 7, today),
        musclesOverMrv = musclesOverMrv,
        readinessScore = readinessScore,
        missedSessions = missedSessions,
    )

    /**
     * Score accumulated fatigue and decide whether the block should end early.
     *
     * No single signal is trusted on its own — one stalled lift is noise, but a stalled lift
     * plus rising RPE plus a group past MRV is a block that has run its course.
     */
    fun assessDeloadNeed(
        signals: FatigueSignals,
        currentPhase: Phase? = null,
    ): DeloadRecommendation {
        // Already deloading — nothing to recommend.
        if (currentPhase == Phase.DELOAD) {
            return DeloadRecommendation(false, DeloadUrgency.NONE, 0, listOf("Already in a deload week."))
        }

        var score = 0
        val reasons = mutableListOf<String>()

        if (signals.stalledLifts >= 2) {
            score += 30
            reasons.add("${signals.stalledLifts} lifts have stopped progressing.")
        } else if (signals.stalledLifts == 1) {
            score += 12
            reasons.add("One lift has stopped progressing.")
        }

        if (signals.rpeCreep >= 0.5) {
            score += 25
            reasons.add("Same loads are feeling ${String.format("%.1f", signals.rpeCreep)} RPE harder than last week.")
        } else if (signals.rpeCreep >= 0.25) {
            score += 12
            reasons.add("Sessions are starting to feel harder at the same loads.")
        }

        if (signals.musclesOverMrv >= 2) {
            score += 25
            reasons.add("${signals.musclesOverMrv} muscle groups are past their recoverable volume.")
        } else if (signals.musclesOverMrv == 1) {
            score += 15
            reasons.add("One muscle group is past its recoverable volume.")
        }

        val readiness = signals.readinessScore
        if (readiness != null && readiness < 50) {
            score += 20
            reasons.add("Recovery is running low (${readiness.roundToInt()}/100).")
        } else if (readiness != null && readiness < 65) {
            score += 10
            reasons.add("Recovery has been below par.")
        }

        if (signals.missedSessions >= 2) {
            score += 10
            reasons.add("${signals.missedSessions} sessions missed this week.")
        }

        score = min(100, score)
        val urgency = when {
            score >= DELOAD_NOW_SCORE -> DeloadUrgency.NOW
            score >= DELOAD_SOON_SCORE -> DeloadUrgency.SOON
            else -> DeloadUrgency.NONE
        }

        return DeloadRecommendation(urgency == DeloadUrgency.NOW, urgency, score, reasons)
    }

    /**
     * The week's plan, with an early deload substituted when fatigue demands one.
     * This is the single call the UI and coach should use.
     */
    fun resolve(
        programWeek: Int,
        blockLength: Int = DEFAULT_BLOCK_LENGTH,
        signals: FatigueSignals? = null,
    ): Resolution {
        val scheduled = state(programWeek, blockLength)
        val deload = signals?.let { assessDeloadNeed(it, scheduled.phase) }
            ?: DeloadRecommendation(false, DeloadUrgency.NONE, 0, emptyList())

        if (!deload.shouldDeload) {
            return Resolution(scheduled, deload, false)
        }

        val reason = deload.reasons.firstOrNull() ?: ""
        return Resolution(
            state = scheduled.copy(
                phase = Phase.DELOAD,
                volumeMultiplier = DELOAD_VOLUME,
                intensityMultiplier = DELOAD_INTENSITY,
                summary = "Early deload — fatigue signals say this block is done. $reason".trim(),
            ),
            deload = deload,
            deloadForced = true,
        )
    }
}
