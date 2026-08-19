package com.refactor.app.api

import com.refactor.app.api.dto.WorkoutExerciseDto
import com.refactor.app.api.dto.WorkoutSetLogDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Mirrors `src/lib/mesocycle.test.ts` and iOS `MesocycleTests.swift`. */
class MesocycleTest {

    private fun log(
        date: String,
        exerciseName: String,
        setIndex: Int,
        rpe: Double? = null,
        weightLbs: Double = 185.0,
        reps: Int = 8,
        section: String = "main",
    ) = WorkoutSetLogDto(
        id = "$date:$exerciseName:$setIndex",
        date = date,
        planId = "plan-1",
        dayLabel = "Monday",
        section = section,
        exerciseName = exerciseName,
        globalSlot = 0,
        setIndex = setIndex,
        weightLbs = weightLbs,
        reps = reps,
        rpe = rpe,
        loggedAt = "${date}T18:00:00.000Z",
    )

    private val noFatigue = Mesocycle.FatigueSignals()

    // ── Block position ──────────────────────────────────

    @Test
    fun `clamps block length to a trainable range`() {
        assertEquals(5, Mesocycle.clampBlockLength(5))
        assertEquals(3, Mesocycle.clampBlockLength(1))
        assertEquals(8, Mesocycle.clampBlockLength(99))
        assertEquals(Mesocycle.DEFAULT_BLOCK_LENGTH, Mesocycle.clampBlockLength(null))
    }

    @Test
    fun `maps continuous program weeks onto repeating blocks`() {
        assertEquals(Pair(1, 1), Mesocycle.blockPosition(1, 5))
        assertEquals(Pair(5, 1), Mesocycle.blockPosition(5, 5))
        assertEquals(Pair(1, 2), Mesocycle.blockPosition(6, 5))
        assertEquals(Pair(2, 3), Mesocycle.blockPosition(12, 5))
    }

    // ── Phases ──────────────────────────────────────────

    @Test
    fun `ramps volume across accumulation weeks`() {
        val w1 = Mesocycle.state(1, 5)
        val w2 = Mesocycle.state(2, 5)
        val w3 = Mesocycle.state(3, 5)

        assertEquals(Mesocycle.Phase.ACCUMULATION, w1.phase)
        assertEquals(0.85, w1.volumeMultiplier, 0.0)
        assertTrue(w2.volumeMultiplier > w1.volumeMultiplier)
        assertEquals(1.15, w3.volumeMultiplier, 0.0)
        assertEquals(1.0, w3.intensityMultiplier, 0.0)
    }

    @Test
    fun `peaks intensity in the second-to-last week`() {
        val peak = Mesocycle.state(4, 5)
        assertEquals(Mesocycle.Phase.PEAK, peak.phase)
        assertTrue(peak.intensityMultiplier > 1.0)
        assertEquals(1.0, peak.volumeMultiplier, 0.0)
    }

    @Test
    fun `deloads on the final week of the block`() {
        val deload = Mesocycle.state(5, 5)
        assertEquals(Mesocycle.Phase.DELOAD, deload.phase)
        assertEquals(0.5, deload.volumeMultiplier, 0.0)
        assertEquals(0.9, deload.intensityMultiplier, 0.0)
        assertTrue(deload.summary.contains("Deload"))
    }

    @Test
    fun `restarts the shape on the next block`() {
        assertEquals(Mesocycle.Phase.ACCUMULATION, Mesocycle.state(6, 5).phase)
        assertEquals(2, Mesocycle.state(6, 5).blockNumber)
        assertEquals(Mesocycle.Phase.DELOAD, Mesocycle.state(10, 5).phase)
    }

    @Test
    fun `omits the peak week in short blocks`() {
        assertEquals(Mesocycle.Phase.ACCUMULATION, Mesocycle.state(1, 3).phase)
        assertEquals(Mesocycle.Phase.ACCUMULATION, Mesocycle.state(2, 3).phase)
        assertEquals(Mesocycle.Phase.DELOAD, Mesocycle.state(3, 3).phase)
    }

    // ── RPE creep ───────────────────────────────────────

    @Test
    fun `detects the same loads feeling harder`() {
        val logs = listOf(
            log("2026-06-24", "Bench Press", 0, rpe = 7.0),
            log("2026-06-26", "Bench Press", 1, rpe = 7.0),
            log("2026-07-01", "Bench Press", 0, rpe = 9.0),
            log("2026-07-03", "Bench Press", 1, rpe = 9.0),
        )
        assertEquals(2.0, Mesocycle.rpeCreep(logs, 7, "2026-07-05"), 0.0)
    }

    @Test
    fun `returns zero without both windows populated`() {
        assertEquals(
            0.0,
            Mesocycle.rpeCreep(listOf(log("2026-07-01", "Bench Press", 0, rpe = 8.0)), 7, "2026-07-05"),
            0.0,
        )
        assertEquals(0.0, Mesocycle.rpeCreep(emptyList(), 7, "2026-07-05"), 0.0)
    }

    @Test
    fun `ignores warmups and unrated sets`() {
        val logs = listOf(
            log("2026-06-24", "Bench Press", 0, rpe = 7.0, section = "warmup"),
            log("2026-06-26", "Bench Press", 1),
            log("2026-07-01", "Bench Press", 0, rpe = 9.0),
        )
        assertEquals(0.0, Mesocycle.rpeCreep(logs, 7, "2026-07-05"), 0.0)
    }

    // ── Deload assessment ───────────────────────────────

    @Test
    fun `stays quiet when nothing is wrong`() {
        val result = Mesocycle.assessDeloadNeed(noFatigue)
        assertFalse(result.shouldDeload)
        assertEquals(Mesocycle.DeloadUrgency.NONE, result.urgency)
        assertEquals(0, result.score)
    }

    @Test
    fun `does not trust a single weak signal`() {
        val result = Mesocycle.assessDeloadNeed(Mesocycle.FatigueSignals(stalledLifts = 1))
        assertFalse(result.shouldDeload)
        assertEquals(Mesocycle.DeloadUrgency.NONE, result.urgency)
    }

    @Test
    fun `calls a deload when signals stack up`() {
        val result = Mesocycle.assessDeloadNeed(
            Mesocycle.FatigueSignals(stalledLifts = 2, rpeCreep = 0.6),
        )
        assertEquals(55, result.score)
        assertEquals(Mesocycle.DeloadUrgency.NOW, result.urgency)
        assertTrue(result.shouldDeload)
        assertTrue(result.reasons.size >= 2)
    }

    @Test
    fun `warns before it insists`() {
        val result = Mesocycle.assessDeloadNeed(Mesocycle.FatigueSignals(stalledLifts = 2))
        assertEquals(Mesocycle.DeloadUrgency.SOON, result.urgency)
        assertFalse(result.shouldDeload)
    }

    @Test
    fun `counts low recovery and missed sessions`() {
        val result = Mesocycle.assessDeloadNeed(
            Mesocycle.FatigueSignals(musclesOverMrv = 2, readinessScore = 40.0, missedSessions = 2),
        )
        assertEquals(55, result.score)
        assertTrue(result.shouldDeload)
    }

    @Test
    fun `does not recommend a deload during one`() {
        val result = Mesocycle.assessDeloadNeed(
            Mesocycle.FatigueSignals(stalledLifts = 3, rpeCreep = 1.0, musclesOverMrv = 3, missedSessions = 3),
            Mesocycle.Phase.DELOAD,
        )
        assertFalse(result.shouldDeload)
        assertEquals(0, result.score)
    }

    @Test
    fun `derives stalls and signals from logs`() {
        val stalledLogs = listOf(
            log("2026-06-01", "Squat", 0, weightLbs = 300.0),
            log("2026-06-08", "Squat", 0, weightLbs = 290.0),
            log("2026-06-15", "Squat", 0, weightLbs = 290.0),
            log("2026-06-22", "Squat", 0, weightLbs = 285.0),
        )
        val signals = Mesocycle.buildFatigueSignals(
            progressions = listOf(Progression.buildExerciseProgression(stalledLogs, "Squat")),
            setLogs = stalledLogs,
            musclesOverMrv = 1,
            readinessScore = 55.0,
            missedSessions = 1,
            today = "2026-06-23",
        )

        assertEquals(1, signals.stalledLifts)
        assertEquals(1, signals.musclesOverMrv)
        assertEquals(55.0, signals.readinessScore!!, 0.0)
        assertEquals(1, signals.missedSessions)
    }

    // ── Resolution ──────────────────────────────────────

    @Test
    fun `follows the schedule when fatigue is low`() {
        val resolution = Mesocycle.resolve(2, 5, noFatigue)
        assertEquals(Mesocycle.Phase.ACCUMULATION, resolution.state.phase)
        assertFalse(resolution.deloadForced)
    }

    @Test
    fun `pulls the deload forward when the body asks for it`() {
        val resolution = Mesocycle.resolve(
            2, 5,
            Mesocycle.FatigueSignals(stalledLifts = 2, rpeCreep = 0.6, musclesOverMrv = 1),
        )
        assertTrue(resolution.deloadForced)
        assertEquals(Mesocycle.Phase.DELOAD, resolution.state.phase)
        assertEquals(0.5, resolution.state.volumeMultiplier, 0.0)
        assertTrue(resolution.state.summary.contains("Early deload"))
        assertEquals(Mesocycle.DeloadUrgency.NOW, resolution.deload.urgency)
    }

    @Test
    fun `works without any fatigue signals`() {
        val resolution = Mesocycle.resolve(5, 5)
        assertEquals(Mesocycle.Phase.DELOAD, resolution.state.phase)
        assertEquals(Mesocycle.DeloadUrgency.NONE, resolution.deload.urgency)
    }

    // ── Drives the prescription ─────────────────────────

    @Test
    fun `deload halves sets and drops load`() {
        val bench = WorkoutExerciseDto(name = "Bench Press", sets = "4", reps = "8-12")
        val history = listOf(log("2026-07-01", "Bench Press", 0, rpe = 7.0, weightLbs = 200.0, reps = 12))
        val progression = Progression.buildExerciseProgression(history, "Bench Press")
        val deloadWeek = Mesocycle.state(5, 5)

        val normal = Progression.prescribeNextSession(bench, progression)
        val deloaded = Progression.prescribeNextSession(
            bench,
            progression,
            Progression.Options(
                intensityMultiplier = deloadWeek.intensityMultiplier,
                volumeMultiplier = deloadWeek.volumeMultiplier,
            ),
        )

        assertEquals(4, normal.targetSets)
        assertEquals(2, deloaded.targetSets)
        assertTrue(deloaded.targetWeightLbs!! < normal.targetWeightLbs!!)
    }

    @Test
    fun `never scales below a single working set`() {
        val single = WorkoutExerciseDto(name = "Bench Press", sets = "1", reps = "8-12")
        val rx = Progression.prescribeNextSession(single, null, Progression.Options(volumeMultiplier = 0.5))
        assertEquals(1, rx.targetSets)
    }

    @Test
    fun `phase labels`() {
        assertEquals("Accumulation", Mesocycle.Phase.ACCUMULATION.label)
        assertEquals("Peak", Mesocycle.Phase.PEAK.label)
        assertEquals("Deload", Mesocycle.Phase.DELOAD.label)
    }
}
