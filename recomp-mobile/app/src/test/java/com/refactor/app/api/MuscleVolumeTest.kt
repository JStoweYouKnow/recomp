package com.refactor.app.api

import com.refactor.app.api.dto.WorkoutExerciseDto
import com.refactor.app.api.dto.WorkoutSetLogDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Mirrors `src/lib/muscle-volume.test.ts` and iOS `MuscleVolumeTests.swift`. */
class MuscleVolumeTest {

    private fun log(
        date: String,
        exerciseName: String,
        setIndex: Int,
        reps: Int? = 10,
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
        weightLbs = 100.0,
        reps = reps,
        loggedAt = "${date}T18:00:00.000Z",
    )

    /** n logged sets of one exercise on one date. */
    private fun sets(date: String, name: String, count: Int) = (0 until count).map { log(date, name, it) }

    private fun setsFor(summary: MuscleVolume.Summary, muscle: MuscleVolume.MuscleGroup): Double =
        summary.entries.first { it.muscle == muscle }.sets

    // ── Classification ──────────────────────────────────

    @Test
    fun `resolves specific patterns before generic ones`() {
        assertEquals(listOf(MuscleVolume.MuscleGroup.HAMSTRINGS), MuscleVolume.classify("Romanian Deadlift").primary)
        assertEquals(
            listOf(MuscleVolume.MuscleGroup.BACK, MuscleVolume.MuscleGroup.HAMSTRINGS),
            MuscleVolume.classify("Conventional Deadlift").primary,
        )
        assertEquals(listOf(MuscleVolume.MuscleGroup.QUADS), MuscleVolume.classify("Leg Extension").primary)
    }

    @Test
    fun `splits compounds into primary and secondary`() {
        val bench = MuscleVolume.classify("Barbell Bench Press")
        assertEquals(listOf(MuscleVolume.MuscleGroup.CHEST), bench.primary)
        assertTrue(bench.secondary.contains(MuscleVolume.MuscleGroup.TRICEPS))

        val row = MuscleVolume.classify("Barbell Row")
        assertEquals(listOf(MuscleVolume.MuscleGroup.BACK), row.primary)
        assertTrue(row.secondary.contains(MuscleVolume.MuscleGroup.BICEPS))
    }

    @Test
    fun `classifies isolation work to a single group`() {
        assertEquals(listOf(MuscleVolume.MuscleGroup.SHOULDERS), MuscleVolume.classify("Lateral Raise").primary)
        assertEquals(listOf(MuscleVolume.MuscleGroup.CALVES), MuscleVolume.classify("Standing Calf Raise").primary)
        assertEquals(listOf(MuscleVolume.MuscleGroup.TRICEPS), MuscleVolume.classify("Tricep Pushdown").primary)
    }

    @Test
    fun `prefers tagged muscles over the name heuristic`() {
        val result = MuscleVolume.classify("Some Machine Press", listOf("lats", "biceps"))
        assertEquals(listOf(MuscleVolume.MuscleGroup.BACK), result.primary)
        assertEquals(listOf(MuscleVolume.MuscleGroup.BICEPS), result.secondary)
    }

    @Test
    fun `returns empty for movements it cannot place`() {
        assertTrue(MuscleVolume.classify("Sled Drag").primary.isEmpty())
        assertTrue(MuscleVolume.classify("").primary.isEmpty())
    }

    @Test
    fun `maps the ExerciseDB vocabulary and drops unknowns`() {
        assertEquals(listOf(MuscleVolume.MuscleGroup.CHEST), MuscleVolume.normalizeTaggedMuscles(listOf("pectorals")))
        assertEquals(
            listOf(MuscleVolume.MuscleGroup.BACK),
            MuscleVolume.normalizeTaggedMuscles(listOf("lats", "upper back")),
        )
        assertTrue(MuscleVolume.normalizeTaggedMuscles(listOf("cardiovascular system")).isEmpty())
        assertTrue(MuscleVolume.normalizeTaggedMuscles(null).isEmpty())
    }

    // ── Weekly volume ───────────────────────────────────

    @Test
    fun `counts primary sets fully and secondary at half credit`() {
        val summary = MuscleVolume.computeWeekly(sets("2026-07-01", "Bench Press", 4), "2026-06-29")
        assertEquals(4.0, setsFor(summary, MuscleVolume.MuscleGroup.CHEST), 0.0)
        assertEquals(2.0, setsFor(summary, MuscleVolume.MuscleGroup.TRICEPS), 0.0)
        assertEquals(2.0, setsFor(summary, MuscleVolume.MuscleGroup.SHOULDERS), 0.0)
        assertEquals(4, summary.totalHardSets)
    }

    @Test
    fun `excludes warmups and unlogged sets`() {
        val logs = listOf(
            log("2026-07-01", "Bench Press", 0, section = "warmup"),
            log("2026-07-01", "Bench Press", 1, reps = null),
            log("2026-07-01", "Bench Press", 2),
        )
        assertEquals(1, MuscleVolume.computeWeekly(logs, "2026-06-29").totalHardSets)
    }

    @Test
    fun `only counts the seven days from weekStart`() {
        val logs = sets("2026-06-28", "Bench Press", 3) +
            sets("2026-06-29", "Bench Press", 3) +
            sets("2026-07-05", "Bench Press", 3) +
            sets("2026-07-06", "Bench Press", 3)
        assertEquals(6, MuscleVolume.computeWeekly(logs, "2026-06-29").totalHardSets)
    }

    @Test
    fun `flags groups below MEV and above MRV`() {
        val logs = sets("2026-06-29", "Bicep Curl", 30) + sets("2026-06-30", "Bench Press", 10)
        val summary = MuscleVolume.computeWeekly(logs, "2026-06-29")

        assertTrue(summary.overdosed.contains(MuscleVolume.MuscleGroup.BICEPS))
        assertTrue(summary.underdosed.contains(MuscleVolume.MuscleGroup.HAMSTRINGS))
        assertFalse(summary.underdosed.contains(MuscleVolume.MuscleGroup.CHEST))
    }

    @Test
    fun `reports how many sets are needed to reach MEV`() {
        val summary = MuscleVolume.computeWeekly(sets("2026-06-29", "Bench Press", 2), "2026-06-29")
        val chest = summary.entries.first { it.muscle == MuscleVolume.MuscleGroup.CHEST }

        assertEquals(2.0, chest.sets, 0.0)
        assertEquals(MuscleVolume.landmarks[MuscleVolume.MuscleGroup.CHEST]!!.mev - 2, chest.setsToMev)
        assertEquals(MuscleVolume.Status.UNDER, chest.status)
    }

    @Test
    fun `scales landmarks by training age`() {
        val logs = sets("2026-06-29", "Bench Press", 6)
        val beginner = MuscleVolume.computeWeekly(logs, "2026-06-29", fitnessLevel = "beginner")
        val advanced = MuscleVolume.computeWeekly(logs, "2026-06-29", fitnessLevel = "advanced")

        assertEquals(
            MuscleVolume.Status.OPTIMAL,
            beginner.entries.first { it.muscle == MuscleVolume.MuscleGroup.CHEST }.status,
        )
        assertEquals(
            MuscleVolume.Status.UNDER,
            advanced.entries.first { it.muscle == MuscleVolume.MuscleGroup.CHEST }.status,
        )
    }

    @Test
    fun `surfaces exercises it could not classify`() {
        val summary = MuscleVolume.computeWeekly(sets("2026-06-29", "Sled Drag", 3), "2026-06-29")
        assertEquals(listOf("Sled Drag"), summary.unclassifiedExercises)
        assertEquals(3, summary.totalHardSets)
    }

    @Test
    fun `uses the tagged-muscle lookup when provided`() {
        val summary = MuscleVolume.computeWeekly(
            sets("2026-06-29", "Mystery Machine", 4),
            "2026-06-29",
            muscleLookup = mapOf("mystery machine" to listOf("glutes")),
        )
        assertEquals(4.0, setsFor(summary, MuscleVolume.MuscleGroup.GLUTES), 0.0)
        assertTrue(summary.unclassifiedExercises.isEmpty())
    }

    // ── Planned volume ──────────────────────────────────

    @Test
    fun `scores the program before anything is logged`() {
        val day = listOf(
            WorkoutExerciseDto(name = "Bench Press", sets = "4", reps = "8-12"),
            WorkoutExerciseDto(name = "Incline Dumbbell Press", sets = "3", reps = "10"),
        )
        val entries = MuscleVolume.computePlanned(listOf(day, day))
        val chest = entries.first { it.muscle == MuscleVolume.MuscleGroup.CHEST }

        assertEquals(14.0, chest.sets, 0.0)
        assertEquals(MuscleVolume.Status.OPTIMAL, chest.status)
    }

    @Test
    fun `honors muscles tagged on the exercise`() {
        val day = listOf(
            WorkoutExerciseDto(name = "Unknown Machine", sets = "5", reps = "10", muscles = listOf("hamstrings")),
        )
        val entries = MuscleVolume.computePlanned(listOf(day))
        assertEquals(5.0, entries.first { it.muscle == MuscleVolume.MuscleGroup.HAMSTRINGS }.sets, 0.0)
    }

    @Test
    fun `muscle labels are title cased`() {
        assertEquals("Hamstrings", MuscleVolume.MuscleGroup.HAMSTRINGS.label)
    }
}
