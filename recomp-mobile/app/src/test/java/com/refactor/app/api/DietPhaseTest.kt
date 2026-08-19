package com.refactor.app.api

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

/** Mirrors `src/lib/diet-phase.test.ts` and iOS `DietPhaseTests.swift`. */
class DietPhaseTest {

    /** Weigh-ins every [stepDays] days, changing by [deltaPerWeek] lbs per week. */
    private fun series(
        startWeight: Double,
        weeks: Int,
        deltaPerWeek: Double,
        stepDays: Int = 2,
        bodyFatStart: Double? = null,
        bodyFatEnd: Double? = null,
    ): List<DietPhase.WeighIn> {
        val start = LocalDate.parse("2026-05-01")
        val totalDays = weeks * 7
        val out = mutableListOf<DietPhase.WeighIn>()
        var day = 0
        while (day <= totalDays) {
            val weight = startWeight + (deltaPerWeek * day) / 7
            val bodyFat = if (bodyFatStart != null && bodyFatEnd != null) {
                Math.round((bodyFatStart + ((bodyFatEnd - bodyFatStart) * day) / totalDays) * 10) / 10.0
            } else null
            out.add(
                DietPhase.WeighIn(
                    date = start.plusDays(day.toLong()).toString(),
                    weightLbs = Math.round(weight * 10) / 10.0,
                    bodyFatPercent = bodyFat,
                )
            )
            day += stepDays
        }
        return out
    }

    // ── Trend ───────────────────────────────────────────

    @Test
    fun `smooths daily noise into a trend`() {
        val noisy = listOf(
            DietPhase.WeighIn("2026-05-01", 200.0),
            DietPhase.WeighIn("2026-05-02", 204.0), // water spike
            DietPhase.WeighIn("2026-05-03", 199.0),
            DietPhase.WeighIn("2026-05-04", 200.0),
            DietPhase.WeighIn("2026-05-10", 198.0),
            DietPhase.WeighIn("2026-05-15", 197.0),
        )
        val trend = DietPhase.computeTrend(noisy)

        assertTrue(trend.trendWeightLbs < 201)
        assertTrue(trend.trendWeightLbs > 197)
        assertEquals(197.0, trend.latestWeightLbs, 0.0)
        assertTrue(trend.reliable)
    }

    @Test
    fun `reports weekly rate as both lbs and percent`() {
        val trend = DietPhase.computeTrend(series(200.0, 8, -2.0))
        assertTrue(trend.weeklyChangeLbs < 0)
        assertTrue(trend.weeklyChangePct < 0)
    }

    @Test
    fun `is unreliable without enough data`() {
        assertFalse(DietPhase.computeTrend(emptyList()).reliable)
        assertFalse(DietPhase.computeTrend(listOf(DietPhase.WeighIn("2026-05-01", 200.0))).reliable)
        val shortSpan = listOf(
            DietPhase.WeighIn("2026-05-01", 200.0),
            DietPhase.WeighIn("2026-05-02", 200.0),
            DietPhase.WeighIn("2026-05-03", 199.0),
            DietPhase.WeighIn("2026-05-04", 199.0),
        )
        assertFalse(DietPhase.computeTrend(shortSpan).reliable)
    }

    @Test
    fun `ignores entries without a weight`() {
        val trend = DietPhase.computeTrend(
            listOf(
                DietPhase.WeighIn("2026-05-01", 200.0),
                DietPhase.WeighIn("2026-05-05", null),
                DietPhase.WeighIn("2026-05-20", 196.0),
            )
        )
        assertEquals(2, trend.weighInCount)
    }

    // ── Lean mass ───────────────────────────────────────

    @Test
    fun `flags when too much of the loss is lean mass`() {
        val signal = DietPhase.computeLeanMassSignal(
            series(200.0, 6, -1.67, 3, 20.0, 19.5)
        )!!
        assertTrue(signal.leanChangeLbs < 0)
        assertTrue(signal.leanShareOfLoss > 0.25)
        assertTrue(signal.losingLeanMass)
    }

    @Test
    fun `stays quiet when fat is doing the leaving`() {
        val signal = DietPhase.computeLeanMassSignal(series(200.0, 6, -1.67, 3, 25.0, 20.0))!!
        assertFalse(signal.losingLeanMass)
    }

    @Test
    fun `returns null without body fat readings`() {
        assertNull(DietPhase.computeLeanMassSignal(series(200.0, 6, -1.5)))
    }

    // ── Cut ─────────────────────────────────────────────

    @Test
    fun `holds steady at a productive rate`() {
        val result = DietPhase.assess("lose_weight", series(200.0, 6, -1.4), 2200)
        assertEquals(DietPhase.Name.CUT, result.phase)
        assertEquals(DietPhase.RateVerdict.ON_TRACK, result.rateVerdict)
        assertEquals(0, result.calorieAdjustment)
    }

    @Test
    fun `adds calories back when the cut is too aggressive`() {
        val result = DietPhase.assess("lose_weight", series(200.0, 6, -4.0), 2200)
        assertEquals(DietPhase.RateVerdict.TOO_FAST, result.rateVerdict)
        assertTrue(result.calorieAdjustment > 0)
        assertTrue(result.details.joinToString(" ").contains("muscle"))
    }

    @Test
    fun `trims calories when loss is too slow`() {
        val result = DietPhase.assess("lose_weight", series(200.0, 6, -0.4), 2200)
        assertEquals(DietPhase.RateVerdict.TOO_SLOW, result.rateVerdict)
        assertTrue(result.calorieAdjustment < 0)
    }

    @Test
    fun `recognizes a stall and suggests a break`() {
        val result = DietPhase.assess("lose_weight", series(200.0, 5, 0.0), 2200)
        assertEquals(DietPhase.RateVerdict.STALLED, result.rateVerdict)
        assertTrue(result.calorieAdjustment < 0)
        assertEquals(DietPhase.Name.DIET_BREAK, result.suggestedPhase)
    }

    @Test
    fun `calls a diet break after a long deficit`() {
        val result = DietPhase.assess(
            "lose_weight", series(200.0, 6, -1.4), 2200,
            estimatedTDEE = 2700, weeksInDeficit = 14,
        )
        assertTrue(result.dietBreakDue)
        assertEquals(DietPhase.Name.DIET_BREAK, result.suggestedPhase)
        assertTrue(result.calorieAdjustment > 0)
        assertTrue(result.headline.contains("diet break"))
    }

    @Test
    fun `lean mass loss overrides an acceptable rate`() {
        val result = DietPhase.assess(
            "lose_weight", series(200.0, 6, -1.4, 3, 20.0, 19.5), 2200,
        )
        assertTrue(result.leanMass!!.losingLeanMass)
        assertTrue(result.details.first().contains("lean mass"))
        assertTrue(result.calorieAdjustment > 0)
    }

    // ── Lean bulk ───────────────────────────────────────

    @Test
    fun `holds at a lean-bulk pace`() {
        val result = DietPhase.assess("build_muscle", series(180.0, 6, 0.7), 3000)
        assertEquals(DietPhase.Name.LEAN_BULK, result.phase)
        assertEquals(DietPhase.RateVerdict.ON_TRACK, result.rateVerdict)
        assertEquals(0, result.calorieAdjustment)
    }

    @Test
    fun `pulls back when gaining too fast`() {
        val result = DietPhase.assess("build_muscle", series(180.0, 6, 2.0), 3400)
        assertEquals(DietPhase.RateVerdict.TOO_FAST, result.rateVerdict)
        assertTrue(result.calorieAdjustment < 0)
    }

    @Test
    fun `adds calories when the scale is flat`() {
        val result = DietPhase.assess("build_muscle", series(180.0, 6, 0.0), 2800)
        assertEquals(DietPhase.RateVerdict.STALLED, result.rateVerdict)
        assertTrue(result.calorieAdjustment > 0)
    }

    @Test
    fun `corrects an accidental deficit`() {
        val result = DietPhase.assess("build_muscle", series(180.0, 6, -1.0), 2600)
        assertEquals(DietPhase.RateVerdict.WRONG_DIRECTION, result.rateVerdict)
        assertTrue(result.calorieAdjustment > 0)
    }

    // ── Maintenance ─────────────────────────────────────

    @Test
    fun `approves a flat trend`() {
        val result = DietPhase.assess("maintain", series(180.0, 6, 0.05), 2600)
        assertEquals(DietPhase.Name.MAINTENANCE, result.phase)
        assertEquals(DietPhase.RateVerdict.ON_TRACK, result.rateVerdict)
        assertEquals(0, result.calorieAdjustment)
    }

    @Test
    fun `corrects drift in either direction`() {
        assertTrue(DietPhase.assess("maintain", series(180.0, 6, 1.0), 2600).calorieAdjustment < 0)
        assertTrue(DietPhase.assess("maintain", series(180.0, 6, -1.0), 2600).calorieAdjustment > 0)
    }

    // ── Guardrails ──────────────────────────────────────

    @Test
    fun `changes nothing when the data is too thin`() {
        val result = DietPhase.assess(
            "lose_weight", listOf(DietPhase.WeighIn("2026-05-01", 200.0)), 2200,
        )
        assertEquals(0, result.calorieAdjustment)
        assertTrue(result.headline.contains("Not enough weigh-ins"))
    }

    @Test
    fun `surfaces a drifting TDEE estimate once it is confident`() {
        val result = DietPhase.assess(
            "lose_weight", series(200.0, 6, -1.4), 2200,
            estimatedTDEE = 2800, tdeeConfidence = 70,
        )
        assertTrue(result.details.joinToString(" ").contains("2800"))
    }

    @Test
    fun `stays quiet about TDEE when confidence is low`() {
        val result = DietPhase.assess(
            "lose_weight", series(200.0, 6, -1.4), 2200,
            estimatedTDEE = 2800, tdeeConfidence = 20,
        )
        assertFalse(result.details.joinToString(" ").contains("2800"))
    }

    @Test
    fun `phase labels`() {
        assertEquals("Cut", DietPhase.Name.CUT.label)
        assertEquals("Diet break", DietPhase.Name.DIET_BREAK.label)
        assertEquals("Lean bulk", DietPhase.Name.LEAN_BULK.label)
        assertEquals("Maintenance", DietPhase.Name.MAINTENANCE.label)
        assertEquals("Recomp", DietPhase.Name.RECOMP.label)
    }
}
