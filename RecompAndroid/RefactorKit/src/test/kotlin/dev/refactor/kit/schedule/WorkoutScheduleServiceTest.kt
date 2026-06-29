package dev.refactor.kit.schedule

import dev.refactor.kit.models.FitnessPlan
import dev.refactor.kit.models.MissedSessionStatus
import dev.refactor.kit.models.WorkoutDay
import dev.refactor.kit.models.WorkoutExercise
import dev.refactor.kit.models.WorkoutPlan
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class WorkoutScheduleServiceTest {

    private fun plan(overrides: WorkoutPlan.() -> WorkoutPlan = { this }): FitnessPlan {
        val base = WorkoutPlan(
            weeklyPlan = listOf(
                WorkoutDay("Monday", "Push", exercises = listOf(WorkoutExercise("Bench", "3", "10"))),
                WorkoutDay("Wednesday", "Pull", exercises = listOf(WorkoutExercise("Row", "3", "10"))),
            ),
        )
        return FitnessPlan("p1", "u1", "2026-01-01", overrides(base))
    }

    @Test
    fun detectMissedSessions_findsIncompletePastDays() {
        val missed = WorkoutScheduleService.detectMissedSessions(plan(), emptyMap(), "2026-06-30", 7)
        assertTrue(missed.isNotEmpty())
    }

    @Test
    fun applyCatchUp_addsToQueue() {
        val p = plan()
        val (wp, _, added) = WorkoutScheduleService.applyScheduleAction(p, dev.refactor.kit.models.ScheduleAction.catch_up, emptyMap(), "2026-06-30")
        assertTrue(added.isNotEmpty())
        assertTrue((wp.missedSessions ?: emptyList()).isNotEmpty())
    }

    @Test
    fun stayOnWeek_incrementsOffset() {
        val p = plan { copy(programWeek1Start = "2026-06-23", programWeekOffset = 0) }
        val (wp, _, _) = WorkoutScheduleService.applyScheduleAction(
            p,
            dev.refactor.kit.models.ScheduleAction.stay_on_week,
            emptyMap(),
            weeksMissed = 1,
        )
        assertEquals(1, wp.programWeekOffset)
    }
}
