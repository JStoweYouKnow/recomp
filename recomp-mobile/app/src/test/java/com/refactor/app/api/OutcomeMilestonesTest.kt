package com.refactor.app.api

import com.refactor.app.api.dto.WorkoutSetLogDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

/** Mirrors the outcome-badge section of `src/lib/milestones.test.ts` and iOS `OutcomeMilestonesTests.swift`. */
class OutcomeMilestonesTest {

    private fun log(
        date: String,
        exerciseName: String,
        setIndex: Int,
        weightLbs: Double,
        reps: Int = 8,
    ) = WorkoutSetLogDto(
        id = "$date:$exerciseName:$setIndex",
        date = date,
        planId = "plan-1",
        dayLabel = "Monday",
        section = "main",
        exerciseName = exerciseName,
        globalSlot = 0,
        setIndex = setIndex,
        weightLbs = weightLbs,
        reps = reps,
        loggedAt = "${date}T18:00:00.000Z",
    )

    /** Weigh-ins from [start] to [end] lbs across [days]. */
    private fun weighIns(
        start: Double,
        end: Double,
        days: Int = 60,
        bfStart: Double? = null,
        bfEnd: Double? = null,
    ): List<DietPhase.WeighIn> {
        val base = LocalDate.parse("2026-05-01")
        val out = mutableListOf<DietPhase.WeighIn>()
        var d = 0
        while (d <= days) {
            val bodyFat = if (bfStart != null && bfEnd != null) {
                bfStart + ((bfEnd - bfStart) * d) / days
            } else null
            out.add(
                DietPhase.WeighIn(
                    date = base.plusDays(d.toLong()).toString(),
                    weightLbs = start + ((end - start) * d) / days,
                    bodyFatPercent = bodyFat,
                )
            )
            d += 3
        }
        return out
    }

    // ── Strength ────────────────────────────────────────

    @Test
    fun `first PR requires beating the first session`() {
        val single = OutcomeMilestones.evaluate(
            OutcomeMilestones.Input(setLogs = listOf(log("2026-05-01", "Bench Press", 0, 185.0)))
        )
        assertFalse(single.newlyEarned.contains("first_pr"))

        val improved = OutcomeMilestones.evaluate(
            OutcomeMilestones.Input(
                setLogs = listOf(
                    log("2026-05-01", "Bench Press", 0, 185.0),
                    log("2026-05-08", "Bench Press", 0, 195.0),
                )
            )
        )
        assertTrue(improved.newlyEarned.contains("first_pr"))
    }

    @Test
    fun `strength badges tier by percent gain`() {
        val result = OutcomeMilestones.evaluate(
            OutcomeMilestones.Input(
                setLogs = listOf(
                    log("2026-05-01", "Bench Press", 0, 185.0),
                    log("2026-06-01", "Bench Press", 0, 205.0),
                )
            )
        )
        assertTrue(result.newlyEarned.contains("strength_up_5"))
        assertTrue(result.newlyEarned.contains("strength_up_10"))
        assertFalse(result.newlyEarned.contains("strength_up_25"))
    }

    @Test
    fun `tracks progress toward the next strength badge`() {
        val result = OutcomeMilestones.evaluate(
            OutcomeMilestones.Input(
                setLogs = listOf(
                    log("2026-05-01", "Bench Press", 0, 200.0),
                    log("2026-06-01", "Bench Press", 0, 205.0),
                )
            )
        )
        val value = result.progress["strength_up_5"] ?: 0.0
        assertTrue(value > 0)
        assertTrue(value < 100)
    }

    @Test
    fun `consistency after eight distinct training weeks`() {
        val base = LocalDate.parse("2026-05-04")
        val logs = (0 until 8).map { week ->
            log(base.plusDays((week * 7).toLong()).toString(), "Bench Press", 0, 185.0)
        }
        assertTrue(
            OutcomeMilestones.evaluate(OutcomeMilestones.Input(setLogs = logs))
                .newlyEarned.contains("consistent_lifter")
        )
        assertFalse(
            OutcomeMilestones.evaluate(OutcomeMilestones.Input(setLogs = logs.take(5)))
                .newlyEarned.contains("consistent_lifter")
        )
    }

    @Test
    fun `deload badge only when completed`() {
        assertTrue(
            OutcomeMilestones.evaluate(OutcomeMilestones.Input(completedDeload = true))
                .newlyEarned.contains("deload_completed")
        )
        assertFalse(
            OutcomeMilestones.evaluate(OutcomeMilestones.Input())
                .newlyEarned.contains("deload_completed")
        )
    }

    // ── Body composition ────────────────────────────────

    @Test
    fun `weight loss tiers off the trend`() {
        val result = OutcomeMilestones.evaluate(OutcomeMilestones.Input(weighIns = weighIns(220.0, 200.0)))
        assertTrue(result.newlyEarned.contains("trend_down_5"))
        assertTrue(result.newlyEarned.contains("trend_down_15"))
        assertFalse(result.newlyEarned.contains("trend_down_30"))
    }

    @Test
    fun `no weight loss badge for a single light day`() {
        val spiky = listOf(
            DietPhase.WeighIn("2026-05-01", 200.0),
            DietPhase.WeighIn("2026-05-02", 200.0),
            DietPhase.WeighIn("2026-05-03", 199.0),
            DietPhase.WeighIn("2026-05-04", 188.0),
        )
        assertFalse(
            OutcomeMilestones.evaluate(OutcomeMilestones.Input(weighIns = spiky))
                .newlyEarned.contains("trend_down_5")
        )
    }

    @Test
    fun `body fat badges by points dropped`() {
        val result = OutcomeMilestones.evaluate(
            OutcomeMilestones.Input(weighIns = weighIns(200.0, 190.0, 60, 25.0, 22.0))
        )
        assertTrue(result.newlyEarned.contains("bodyfat_down_2"))
        assertFalse(result.newlyEarned.contains("bodyfat_down_5"))
    }

    @Test
    fun `lean mass gain`() {
        val result = OutcomeMilestones.evaluate(
            OutcomeMilestones.Input(weighIns = weighIns(180.0, 186.0, 60, 18.0, 15.0))
        )
        assertTrue(result.newlyEarned.contains("lean_mass_gained"))
    }

    @Test
    fun `recomp requires fat down and lean up`() {
        val recomp = OutcomeMilestones.evaluate(
            OutcomeMilestones.Input(weighIns = weighIns(200.0, 198.0, 60, 25.0, 20.0))
        )
        assertTrue(recomp.newlyEarned.contains("recomp_achieved"))

        // Fat and lean both falling is a plain cut, not a recomp.
        val plainCut = OutcomeMilestones.evaluate(
            OutcomeMilestones.Input(weighIns = weighIns(200.0, 188.0, 60, 25.0, 24.5))
        )
        assertFalse(plainCut.newlyEarned.contains("recomp_achieved"))
    }

    // ── Award semantics ─────────────────────────────────

    @Test
    fun `never re-awards an earned badge`() {
        val result = OutcomeMilestones.evaluate(
            OutcomeMilestones.Input(
                setLogs = listOf(
                    log("2026-05-01", "Bench Press", 0, 185.0),
                    log("2026-06-01", "Bench Press", 0, 205.0),
                ),
                earned = setOf("first_pr", "strength_up_5", "strength_up_10"),
            )
        )
        assertFalse(result.newlyEarned.contains("first_pr"))
        assertFalse(result.newlyEarned.contains("strength_up_5"))
    }

    @Test
    fun `awards nothing without data`() {
        assertTrue(OutcomeMilestones.evaluate(OutcomeMilestones.Input()).newlyEarned.isEmpty())
    }

    @Test
    fun `badge catalog matches the other platforms`() {
        assertEquals(14, OutcomeMilestones.BADGES.size)
        assertEquals(14, OutcomeMilestones.BADGES.map { it.id }.toSet().size)
    }

    // ── Deload completion ───────────────────────────────

    @Test
    fun `deload week completion detection`() {
        // Block length 5 anchored at 2026-05-04 → week 5 starts 2026-06-01.
        val anchor = "2026-05-04"

        assertTrue(OutcomeMilestones.hasCompletedDeloadWeek(anchor, 7, setOf("2026-06-01"), 5))
        assertFalse(OutcomeMilestones.hasCompletedDeloadWeek(anchor, 7, setOf("2026-05-11", "2026-06-08"), 5))
        // Week 5 is the deload; it is not behind them yet.
        assertFalse(OutcomeMilestones.hasCompletedDeloadWeek(anchor, 5, setOf("2026-06-01"), 5))
        // Second block's deload week starts 2026-07-06 (program week 10).
        assertTrue(OutcomeMilestones.hasCompletedDeloadWeek(anchor, 12, setOf("2026-07-06"), 5))
    }
}
