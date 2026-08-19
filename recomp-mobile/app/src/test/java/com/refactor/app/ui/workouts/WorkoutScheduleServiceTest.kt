package com.refactor.app.ui.workouts

import com.refactor.app.api.dto.FitnessPlanDto
import com.refactor.app.api.dto.MissedSessionDto
import com.refactor.app.api.dto.WorkoutDayDto
import com.refactor.app.api.dto.WorkoutExerciseDto
import com.refactor.app.api.dto.WorkoutPlanSectionDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Mirrors the web `countRecentMissed` suite and iOS `workoutSchedule_*` tests. */
class WorkoutScheduleServiceTest {

    private val bench = WorkoutExerciseDto(name = "Bench", sets = "3", reps = "10")

    private fun plan(missed: List<MissedSessionDto> = emptyList()) = FitnessPlanDto(
        id = "plan-1",
        userId = "user-1",
        createdAt = "2026-01-01T00:00:00.000Z",
        workoutPlan = WorkoutPlanSectionDto(
            weeklyPlan = listOf(
                WorkoutDayDto(day = "Monday", focus = "Push", exercises = listOf(bench)),
            ),
            tips = emptyList(),
            missedSessions = missed,
        ),
    )

    @Test
    fun `ignores tracked sessions whose planIndex no longer exists`() {
        // A regenerated (shorter) plan leaves behind missedSessions pointing at removed days.
        // Counting those inflates the total and shows a phantom catch-up banner.
        val p = plan(
            listOf(
                MissedSessionDto(
                    id = "99:2026-06-29",
                    planIndex = 99,
                    scheduledDate = "2026-06-29",
                    status = "missed",
                    dayLabel = "Monday",
                    focus = "Push",
                )
            )
        )
        // Mark the real Monday complete so detection contributes nothing to the count.
        val progress = mapOf(
            WorkoutWebProgress.legacyKey(
                planId = p.id,
                dayLabel = "Monday",
                section = "main",
                exercise = bench,
            ) to "2026-06-29T18:00:00.000Z"
        )

        assertEquals(0, WorkoutScheduleService.countRecentMissed(p, progress, 7, "2026-06-30"))
    }

    @Test
    fun `still counts tracked sessions that point at a real day`() {
        val p = plan(
            listOf(
                MissedSessionDto(
                    id = "0:2026-06-22",
                    planIndex = 0,
                    scheduledDate = "2026-06-22",
                    status = "missed",
                    dayLabel = "Monday",
                    focus = "Push",
                )
            )
        )
        assertTrue(WorkoutScheduleService.countRecentMissed(p, emptyMap(), 14, "2026-06-30") > 0)
    }

    @Test
    fun `single-week plans still advance for periodization`() {
        // The plan-index lookup pins these to their weekday template; the mesocycle needs
        // elapsed training time instead, or a repeating plan never reaches a deload.
        val p = plan().copy(createdAt = "2026-06-01T00:00:00.000Z")

        assertEquals(1, WorkoutProgramSchedule.trainingWeeksElapsed(p, "2026-06-01"))
        assertEquals(2, WorkoutProgramSchedule.trainingWeeksElapsed(p, "2026-06-08"))
        assertEquals(6, WorkoutProgramSchedule.trainingWeeksElapsed(p, "2026-07-06"))
    }

    @Test
    fun `prefers an explicit program anchor over the creation date`() {
        val base = plan().copy(createdAt = "2026-01-01T00:00:00.000Z")
        val p = base.copy(workoutPlan = base.workoutPlan?.copy(programWeek1Start = "2026-06-22"))
        assertEquals(3, WorkoutProgramSchedule.trainingWeeksElapsed(p, "2026-07-06"))
    }

    @Test
    fun `never returns less than week 1`() {
        val base = plan()
        val p = base.copy(workoutPlan = base.workoutPlan?.copy(programWeek1Start = "2026-08-01"))
        assertEquals(1, WorkoutProgramSchedule.trainingWeeksElapsed(p, "2026-06-01"))
    }
}
