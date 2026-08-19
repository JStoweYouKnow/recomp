package com.refactor.app.api

import com.refactor.app.api.dto.WorkoutExerciseDto
import com.refactor.app.api.dto.WorkoutSetLogDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Mirrors `src/lib/progression.test.ts` and iOS `ProgressionTests.swift` — all three must agree. */
class ProgressionTest {

    private fun log(
        date: String,
        exerciseName: String,
        setIndex: Int,
        weightLbs: Double? = null,
        reps: Int? = null,
        rpe: Double? = null,
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

    private val benchPress = WorkoutExerciseDto(name = "Bench Press", sets = "3", reps = "8-12")

    // ── e1RM ────────────────────────────────────────────

    @Test
    fun `estimateOneRepMax uses Epley without RPE`() {
        assertEquals(233.33, Progression.estimateOneRepMax(200.0, 5), 0.1)
    }

    @Test
    fun `estimateOneRepMax credits reps in reserve`() {
        assertEquals(246.67, Progression.estimateOneRepMax(200.0, 5, 8.0), 0.1)
        assertEquals(
            Progression.estimateOneRepMax(200.0, 5),
            Progression.estimateOneRepMax(200.0, 5, 10.0),
            0.001,
        )
    }

    @Test
    fun `estimateOneRepMax is zero for invalid input`() {
        assertEquals(0.0, Progression.estimateOneRepMax(0.0, 5), 0.0)
        assertEquals(0.0, Progression.estimateOneRepMax(200.0, 0), 0.0)
    }

    @Test
    fun `loadForReps inverts Epley`() {
        val e1rm = Progression.estimateOneRepMax(200.0, 5)
        assertEquals(200.0, Progression.loadForReps(e1rm, 5), 0.001)
    }

    // ── Parsing ─────────────────────────────────────────

    @Test
    fun `parseRepRange handles ranges and singles`() {
        assertEquals(Progression.RepRange(8, 12), Progression.parseRepRange("8-12"))
        assertEquals(Progression.RepRange(10, 10), Progression.parseRepRange("10"))
        assertEquals(Progression.RepRange(12, 12), Progression.parseRepRange("12 each side"))
    }

    @Test
    fun `parseRepRange returns null for timed work`() {
        assertNull(Progression.parseRepRange("30 sec"))
        assertNull(Progression.parseRepRange("AMRAP"))
        assertNull(Progression.parseRepRange(null))
    }

    @Test
    fun `parseSetTarget defaults sanely`() {
        assertEquals(3, Progression.parseSetTarget("3"))
        assertEquals(4, Progression.parseSetTarget("3-4 sets"))
        assertEquals(3, Progression.parseSetTarget("nonsense"))
    }

    // ── Load increments ─────────────────────────────────

    @Test
    fun `load increment scales to movement`() {
        assertEquals(10.0, Progression.loadIncrementLbs("Back Squat"), 0.0)
        assertEquals(10.0, Progression.loadIncrementLbs("Romanian Deadlift"), 0.0)
        assertEquals(5.0, Progression.loadIncrementLbs("Bench Press"), 0.0)
        assertEquals(5.0, Progression.loadIncrementLbs("Dumbbell Shoulder Press"), 0.0)
        assertEquals(2.5, Progression.loadIncrementLbs("Bicep Curl"), 0.0)
        assertEquals(2.5, Progression.loadIncrementLbs("Lateral Raise"), 0.0)
    }

    @Test
    fun `roundToLoadable snaps to plates`() {
        assertEquals(185.0, Progression.roundToLoadable(183.0, 10.0), 0.0)
        assertEquals(30.0, Progression.roundToLoadable(31.2, 2.5), 0.0)
    }

    // ── Trend ───────────────────────────────────────────

    @Test
    fun `buildProgression collapses sessions and tracks trend`() {
        val logs = listOf(
            log("2026-07-01", "Bench Press", 0, 185.0, 8),
            log("2026-07-01", "Bench Press", 1, 185.0, 7),
            log("2026-07-08", "Bench Press", 0, 190.0, 8),
            log("2026-07-15", "Bench Press", 0, 195.0, 9),
        )
        val p = Progression.buildExerciseProgression(logs, "Bench Press")

        assertEquals(3, p.sessions.size)
        assertEquals(185.0, p.sessions[0].topSetWeightLbs!!, 0.0)
        assertEquals(8, p.sessions[0].topSetReps)
        assertEquals(Progression.Trend.CLIMBING, p.trend)
        assertTrue(p.changePct > 0)
        assertFalse(p.stalled)
    }

    @Test
    fun `buildProgression ignores warmups`() {
        val logs = listOf(
            log("2026-07-01", "Bench Press", 0, 500.0, 5, section = "warmup"),
            log("2026-07-01", "Bench Press", 1, 185.0, 8),
        )
        val p = Progression.buildExerciseProgression(logs, "Bench Press")
        assertEquals(1, p.sessions.size)
        assertEquals(185.0, p.sessions[0].topSetWeightLbs!!, 0.0)
    }

    @Test
    fun `buildProgression matches names case-insensitively`() {
        val logs = listOf(log("2026-07-01", "bench press ", 0, 185.0, 8))
        assertEquals(1, Progression.buildExerciseProgression(logs, "Bench Press").sessions.size)
    }

    @Test
    fun `buildProgression flags stall after three sessions`() {
        val logs = listOf(
            log("2026-07-01", "Bench Press", 0, 200.0, 8),
            log("2026-07-08", "Bench Press", 0, 195.0, 8),
            log("2026-07-15", "Bench Press", 0, 195.0, 8),
            log("2026-07-22", "Bench Press", 0, 190.0, 8),
        )
        val p = Progression.buildExerciseProgression(logs, "Bench Press")
        assertEquals(3, p.sessionsSinceBest)
        assertTrue(p.stalled)
        assertEquals(Progression.Trend.DECLINING, p.trend)
    }

    @Test
    fun `buildProgression reports insufficient data`() {
        val p = Progression.buildExerciseProgression(
            listOf(log("2026-07-01", "Bench Press", 0)),
            "Bench Press",
        )
        assertEquals(Progression.Trend.INSUFFICIENT_DATA, p.trend)
        assertTrue(p.sessions.isEmpty())
    }

    @Test
    fun `buildAllProgressions returns one per exercise`() {
        val logs = listOf(
            log("2026-07-01", "Bench Press", 0, 185.0, 8),
            log("2026-07-01", "Back Squat", 0, 275.0, 5),
        )
        assertEquals(2, Progression.buildAllProgressions(logs).size)
    }

    // ── Prescription ────────────────────────────────────

    @Test
    fun `prescribes baseline without history`() {
        val rx = Progression.prescribeNextSession(benchPress, null)
        assertEquals(Progression.Action.ESTABLISH_BASELINE, rx.action)
        assertNull(rx.targetWeightLbs)
        assertEquals(Progression.Confidence.LOW, rx.confidence)
    }

    @Test
    fun `adds load after topping the rep range`() {
        val logs = listOf(
            log("2026-07-01", "Bench Press", 0, 185.0, 10, 7.0),
            log("2026-07-08", "Bench Press", 0, 185.0, 12, 8.0),
        )
        val rx = Progression.prescribeNextSession(
            benchPress,
            Progression.buildExerciseProgression(logs, "Bench Press"),
        )
        assertEquals(Progression.Action.ADD_LOAD, rx.action)
        assertEquals(190.0, rx.targetWeightLbs!!, 0.0)
        assertEquals(8, rx.targetReps)
        assertTrue(rx.rationale.contains("190"))
    }

    @Test
    fun `adds a rep when short of the range`() {
        val logs = listOf(log("2026-07-08", "Bench Press", 0, 185.0, 9, 8.0))
        val rx = Progression.prescribeNextSession(
            benchPress,
            Progression.buildExerciseProgression(logs, "Bench Press"),
        )
        assertEquals(Progression.Action.ADD_REPS, rx.action)
        assertEquals(185.0, rx.targetWeightLbs!!, 0.0)
        assertEquals(10, rx.targetReps)
    }

    @Test
    fun `holds after a grind`() {
        val logs = listOf(log("2026-07-08", "Bench Press", 0, 185.0, 9, 10.0))
        val rx = Progression.prescribeNextSession(
            benchPress,
            Progression.buildExerciseProgression(logs, "Bench Press"),
        )
        assertEquals(Progression.Action.HOLD, rx.action)
        assertEquals(185.0, rx.targetWeightLbs!!, 0.0)
        assertTrue(rx.rationale.contains("RPE 10"))
    }

    @Test
    fun `no load jump on a maximal top set`() {
        val logs = listOf(log("2026-07-08", "Bench Press", 0, 185.0, 12, 10.0))
        val rx = Progression.prescribeNextSession(
            benchPress,
            Progression.buildExerciseProgression(logs, "Bench Press"),
        )
        assertNotEquals(Progression.Action.ADD_LOAD, rx.action)
    }

    @Test
    fun `deloads a stalled lift by ten percent`() {
        val logs = listOf(
            log("2026-07-01", "Back Squat", 0, 300.0, 5, 8.0),
            log("2026-07-08", "Back Squat", 0, 290.0, 5, 8.0),
            log("2026-07-15", "Back Squat", 0, 290.0, 5, 9.0),
            log("2026-07-22", "Back Squat", 0, 285.0, 5, 9.0),
        )
        val squat = WorkoutExerciseDto(name = "Back Squat", sets = "4", reps = "5-8")
        val rx = Progression.prescribeNextSession(
            squat,
            Progression.buildExerciseProgression(logs, "Back Squat"),
        )
        assertEquals(Progression.Action.DELOAD, rx.action)
        assertEquals(255.0, rx.targetWeightLbs!!, 0.0)
        assertTrue(rx.rationale.contains("plateau"))
    }

    @Test
    fun `suppresses load increases when recovery is low`() {
        val logs = listOf(log("2026-07-08", "Bench Press", 0, 185.0, 12, 7.0))
        val progression = Progression.buildExerciseProgression(logs, "Bench Press")

        assertEquals(
            Progression.Action.ADD_LOAD,
            Progression.prescribeNextSession(benchPress, progression).action,
        )

        val tired = Progression.prescribeNextSession(
            benchPress,
            progression,
            Progression.Options(readinessScore = 45.0),
        )
        assertEquals(Progression.Action.HOLD, tired.action)
        assertEquals(185.0, tired.targetWeightLbs!!, 0.0)
        assertTrue(tired.rationale.contains("45/100"))
    }

    @Test
    fun `scales by the intensity multiplier`() {
        val logs = listOf(log("2026-07-08", "Bench Press", 0, 200.0, 9, 8.0))
        val rx = Progression.prescribeNextSession(
            benchPress,
            Progression.buildExerciseProgression(logs, "Bench Press"),
            Progression.Options(intensityMultiplier = 0.9),
        )
        assertEquals(180.0, rx.targetWeightLbs!!, 0.0)
    }

    @Test
    fun `skips load prescription for timed work`() {
        val plank = WorkoutExerciseDto(name = "Plank", sets = "3", reps = "45 sec")
        val rx = Progression.prescribeNextSession(plank, null)
        assertEquals(Progression.Action.HOLD, rx.action)
        assertNull(rx.targetWeightLbs)
    }

    @Test
    fun `marks confidence low on high reps`() {
        val highRep = WorkoutExerciseDto(name = "Leg Extension", sets = "3", reps = "15-20")
        val logs = listOf(log("2026-07-08", "Leg Extension", 0, 90.0, 18, 8.0))
        val rx = Progression.prescribeNextSession(
            highRep,
            Progression.buildExerciseProgression(logs, "Leg Extension"),
        )
        assertEquals(Progression.Confidence.LOW, rx.confidence)
    }

    @Test
    fun `prescribes a whole day keyed by normalized name`() {
        val logs = listOf(
            log("2026-07-08", "Bench Press", 0, 185.0, 12, 7.0),
            log("2026-07-08", "Bicep Curl", 0, 30.0, 12, 8.0),
        )
        val day = listOf(benchPress, WorkoutExerciseDto(name = "Bicep Curl", sets = "3", reps = "10-12"))
        val rxs = Progression.prescribeWorkoutDay(day, logs)

        assertEquals(2, rxs.size)
        assertEquals(190.0, rxs["bench press"]!!.targetWeightLbs!!, 0.0)
        assertEquals(32.5, rxs["bicep curl"]!!.targetWeightLbs!!, 0.0)
    }

    @Test
    fun `summary separates climbing from stalled`() {
        val logs = listOf(
            log("2026-07-01", "Bench Press", 0, 185.0, 8, 8.0),
            log("2026-07-08", "Bench Press", 0, 195.0, 8, 8.0),
            log("2026-06-01", "Back Squat", 0, 300.0, 5, 8.0),
            log("2026-06-08", "Back Squat", 0, 290.0, 5, 8.0),
            log("2026-06-15", "Back Squat", 0, 290.0, 5, 8.0),
            log("2026-06-22", "Back Squat", 0, 285.0, 5, 8.0),
        )
        val summary = Progression.summarize(
            Progression.buildAllProgressions(logs),
            recentDays = 14,
            today = "2026-07-10",
        )

        assertEquals(2, summary.trackedExercises)
        assertTrue(summary.climbing.contains("Bench Press"))
        assertTrue(summary.stalled.contains("Back Squat"))
        assertEquals(listOf("Bench Press"), summary.recentPrs.map { it.exerciseName })
        assertEquals("Bench Press", summary.topGains.first().exerciseName)
    }
}
