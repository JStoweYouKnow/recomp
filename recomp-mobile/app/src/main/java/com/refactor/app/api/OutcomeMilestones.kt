package com.refactor.app.api

import com.refactor.app.api.dto.WorkoutSetLogDto
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.format.DateTimeParseException
import java.time.temporal.TemporalAdjusters
import kotlin.math.max
import kotlin.math.min

/**
 * Badges earned by the body changing rather than the app being used.
 *
 * Every detector here reads from the deterministic engines ([Progression], [MuscleVolume],
 * [DietPhase]) rather than re-deriving anything, so a badge can never celebrate a number the
 * coach would not also report.
 *
 * Mirrors the outcome section of web `src/lib/milestones.ts` and iOS `OutcomeMilestones.swift`.
 */
object OutcomeMilestones {

    /** Badge ids and display names, matching web `BADGE_INFO` and iOS `MilestoneType`. */
    val BADGES: List<Badge> = listOf(
        Badge("first_pr", "First PR", "Set your first estimated 1RM record", 75),
        Badge("strength_up_5", "Stronger", "A lift's estimated 1RM up 5%", 150),
        Badge("strength_up_10", "Much Stronger", "A lift's estimated 1RM up 10%", 300),
        Badge("strength_up_25", "Transformed Strength", "A lift's estimated 1RM up 25%", 750),
        Badge("volume_balanced", "Balanced Build", "Every trained muscle hit its weekly minimum", 150),
        Badge("deload_completed", "Smart Recovery", "Completed a full deload week", 100),
        Badge("consistent_lifter", "Iron Habit", "Logged sets in 8 straight weeks", 300),
        Badge("trend_down_5", "5 Pounds Down", "Trend weight down 5 lb from your start", 150),
        Badge("trend_down_15", "15 Pounds Down", "Trend weight down 15 lb", 400),
        Badge("trend_down_30", "30 Pounds Down", "Trend weight down 30 lb", 900),
        Badge("bodyfat_down_2", "Leaner", "Body fat down 2 percentage points", 250),
        Badge("bodyfat_down_5", "Visibly Leaner", "Body fat down 5 percentage points", 600),
        Badge("lean_mass_gained", "Real Muscle", "Gained 3+ lb of lean mass", 500),
        Badge("recomp_achieved", "Recomposition", "Lost fat and gained lean mass at once", 800),
    )

    data class Badge(val id: String, val name: String, val desc: String, val xp: Int)

    data class Input(
        /** Per-set performance history — drives every strength and volume outcome badge. */
        val setLogs: List<WorkoutSetLogDto> = emptyList(),
        /** Weigh-ins with optional body fat — drives every body-composition badge. */
        val weighIns: List<DietPhase.WeighIn> = emptyList(),
        /** True once a scheduled or fatigue-driven deload week has been trained through. */
        val completedDeload: Boolean = false,
        /** User's training level, for scaling volume landmarks. */
        val fitnessLevel: String? = null,
        /** Badge ids already earned; never re-awarded. */
        val earned: Set<String> = emptySet(),
        val today: String = LocalDate.now().toString(),
    )

    data class Result(
        val newlyEarned: List<String>,
        /** 0-100 progress toward badges not yet earned, keyed by badge id. */
        val progress: Map<String, Double>,
    )

    fun evaluate(input: Input): Result {
        val newlyEarned = mutableListOf<String>()
        val progress = mutableMapOf<String, Double>()

        fun award(id: String) {
            if (id in input.earned || id in newlyEarned) return
            newlyEarned.add(id)
        }

        // ── Strength ──

        if (input.setLogs.isNotEmpty()) {
            val progressions = Progression.buildAllProgressions(input.setLogs)

            // A first PR requires a second session to beat the first — otherwise every new
            // exercise would instantly "PR" on the day it is introduced.
            if (progressions.any { it.sessions.size >= 2 && it.bestE1rmDate != it.sessions.first().date }) {
                award("first_pr")
            }

            val bestGain = progressions.fold(0.0) { acc, p -> max(acc, p.changePct) }
            progress["strength_up_5"] = min(100.0, (bestGain / 5) * 100)
            if (bestGain >= 5) award("strength_up_5")
            if (bestGain >= 10) award("strength_up_10")
            if (bestGain >= 25) award("strength_up_25")

            // Eight distinct training weeks with logged sets.
            val weeks = input.setLogs
                .filter { it.reps != null }
                .mapNotNull { mondayWeekStart(it.date) }
                .toSet()
            progress["consistent_lifter"] = min(100.0, (weeks.size / 8.0) * 100)
            if (weeks.size >= 8) award("consistent_lifter")

            // Every muscle that was trained at all cleared its weekly minimum. Untouched
            // groups are excluded — a well-run split should not be penalized for rest days.
            val volume = MuscleVolume.computeWeekly(
                setLogs = input.setLogs,
                weekStart = mondayWeekStart(input.today) ?: input.today,
                fitnessLevel = input.fitnessLevel,
            )
            val trained = volume.entries.filter { it.sets > 0 }
            if (trained.size >= 4 && trained.all { it.status != MuscleVolume.Status.UNDER }) {
                award("volume_balanced")
            }
        }

        if (input.completedDeload) award("deload_completed")

        // ── Body composition ──

        val sorted = input.weighIns
            .filter { (it.weightLbs ?: 0.0) > 0 }
            .sortedBy { it.date }

        if (sorted.size >= 2) {
            /*
             * Compare the mean of the first three weigh-ins against the mean of the last three.
             *
             * The EWMA trend used elsewhere is deliberately laggy — good for "what do I weigh
             * today", wrong for "how much have I lost in total", where it under-credits by
             * ~8 lb on a 20 lb loss. A short mean at each end is lag-free and still immune to
             * a single anomalous reading, which is exactly what a cumulative badge needs.
             */
            val windowSize = max(1, min(3, sorted.size / 2))
            fun meanOf(window: List<DietPhase.WeighIn>) =
                window.sumOf { it.weightLbs ?: 0.0 } / window.size
            val lost = meanOf(sorted.take(windowSize)) - meanOf(sorted.takeLast(windowSize))

            // Same reliability bar the diet engine uses (4+ weigh-ins across 10+ days).
            if (DietPhase.computeTrend(sorted).reliable) {
                progress["trend_down_5"] = min(100.0, (lost / 5) * 100)
                if (lost >= 5) award("trend_down_5")
                if (lost >= 15) award("trend_down_15")
                if (lost >= 30) award("trend_down_30")
            }

            val withBodyFat = sorted.filter { (it.bodyFatPercent ?: 0.0) > 0 }
            if (withBodyFat.size >= 2) {
                val first = withBodyFat.first()
                val last = withBodyFat.last()
                val firstWeight = first.weightLbs ?: 0.0
                val lastWeight = last.weightLbs ?: 0.0
                val firstBF = first.bodyFatPercent ?: 0.0
                val lastBF = last.bodyFatPercent ?: 0.0

                val bodyFatDrop = firstBF - lastBF
                progress["bodyfat_down_2"] = min(100.0, (bodyFatDrop / 2) * 100)
                if (bodyFatDrop >= 2) award("bodyfat_down_2")
                if (bodyFatDrop >= 5) award("bodyfat_down_5")

                val leanFirst = firstWeight * (1 - firstBF / 100)
                val leanLast = lastWeight * (1 - lastBF / 100)
                val leanGain = leanLast - leanFirst
                val fatFirst = firstWeight - leanFirst
                val fatLast = lastWeight - leanLast

                progress["lean_mass_gained"] = min(100.0, (leanGain / 3) * 100)
                if (leanGain >= 3) award("lean_mass_gained")

                // The hardest outcome in the app: fat down and lean up over the same window.
                if (leanGain >= 1 && fatLast < fatFirst - 1) award("recomp_achieved")
            }
        }

        return Result(newlyEarned, progress)
    }

    /**
     * Whether the lifter has actually trained through a deload week.
     *
     * A deload only counts once it is behind them and they logged work during it — skipping
     * the week entirely is not the same as executing a planned back-off.
     */
    fun hasCompletedDeloadWeek(
        anchorWeekStart: String,
        programWeekNow: Int,
        loggedWeekStarts: Set<String>,
        blockLength: Int = Mesocycle.DEFAULT_BLOCK_LENGTH,
    ): Boolean {
        val length = Mesocycle.clampBlockLength(blockLength)
        val anchor = try {
            LocalDate.parse(anchorWeekStart)
        } catch (_: DateTimeParseException) {
            return false
        }

        // Deload weeks sit at every multiple of the block length.
        var week = length
        while (week < programWeekNow) {
            if (anchor.plusDays(((week - 1) * 7).toLong()).toString() in loggedWeekStarts) return true
            week += length
        }
        return false
    }

    private fun mondayWeekStart(date: String): String? = try {
        LocalDate.parse(date).with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).toString()
    } catch (_: DateTimeParseException) {
        null
    }
}
