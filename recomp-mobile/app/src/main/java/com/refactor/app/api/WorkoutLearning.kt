package com.refactor.app.api

import com.refactor.app.api.dto.CompletedSessionSummaryDto
import com.refactor.app.api.dto.FitnessPlanDto
import com.refactor.app.api.dto.NextWorkoutPreviewDto
import com.refactor.app.api.dto.WorkoutHistorySummaryDto
import com.refactor.app.ui.workouts.WorkoutScheduleService
import java.time.LocalDate
import java.time.format.DateTimeParseException

/** Builds Rico workout-learning context from plan + progress (mirrors web `workout-learning.ts`). */
internal object WorkoutLearning {

    fun buildRicoContextFields(
        plan: FitnessPlanDto?,
        progress: Map<String, String>,
        today: String = LocalDate.now().toString(),
    ): WorkoutLearningContextFields {
        if (plan == null) return WorkoutLearningContextFields()
        val history = buildHistory(plan, progress, today)
        val completedToday = completedSession(plan, progress, today)
        val next = findNextWorkout(plan, progress, today)
        return WorkoutLearningContextFields(
            completedWorkoutToday = completedToday,
            workoutHistory = history,
            nextWorkout = next,
        )
    }

    private fun completedSession(
        plan: FitnessPlanDto,
        progress: Map<String, String>,
        date: String,
    ): CompletedSessionSummaryDto? {
        val planIndex = WorkoutScheduleService.matchDayToDate(plan, date) ?: return null
        if (!WorkoutScheduleService.isWorkoutSessionComplete(plan, planIndex, date, progress)) return null
        val day = plan.workoutPlan?.weeklyPlan?.getOrNull(planIndex) ?: return null
        val names = allExerciseNames(day)
        return CompletedSessionSummaryDto(
            date = date,
            planIndex = planIndex,
            day = day.day,
            focus = day.focus,
            exercisesCompleted = names,
            exerciseCount = names.size,
        )
    }

    private fun buildHistory(
        plan: FitnessPlanDto,
        progress: Map<String, String>,
        today: String,
        lookbackDays: Int = 28,
    ): WorkoutHistorySummaryDto {
        val sessions = mutableListOf<CompletedSessionSummaryDto>()
        val seen = mutableSetOf<String>()
        val todayDate = parseDate(today) ?: LocalDate.now()
        for (offset in 0 until lookbackDays) {
            val dateStr = todayDate.minusDays(offset.toLong()).toString()
            val planIndex = WorkoutScheduleService.matchDayToDate(plan, dateStr) ?: continue
            val key = "$planIndex:$dateStr"
            if (!seen.add(key)) continue
            val summary = completedSession(plan, progress, dateStr) ?: continue
            sessions.add(summary)
        }
        sessions.sortByDescending { it.date }
        val exerciseFrequency = mutableMapOf<String, Int>()
        val focusFrequency = mutableMapOf<String, Int>()
        for (session in sessions) {
            val focusKey = session.focus.trim().lowercase()
            if (focusKey.isNotEmpty()) focusFrequency[focusKey] = (focusFrequency[focusKey] ?: 0) + 1
            for (name in session.exercisesCompleted) {
                val k = name.lowercase()
                exerciseFrequency[k] = (exerciseFrequency[k] ?: 0) + 1
            }
        }
        return WorkoutHistorySummaryDto(
            sessionsCompletedLast7Days = sessions.count { withinDays(it.date, today, 7) },
            sessionsCompletedLast14Days = sessions.count { withinDays(it.date, today, 14) },
            recentSessions = sessions.take(8),
            exerciseFrequency = exerciseFrequency,
            focusFrequency = focusFrequency,
        )
    }

    private fun findNextWorkout(
        plan: FitnessPlanDto,
        progress: Map<String, String>,
        today: String,
    ): NextWorkoutPreviewDto? {
        val todayDate = parseDate(today) ?: LocalDate.now()
        for (offset in 0..14) {
            val dateStr = todayDate.plusDays(offset.toLong()).toString()
            val planIndex = WorkoutScheduleService.matchDayToDate(plan, dateStr) ?: continue
            if (WorkoutScheduleService.isWorkoutSessionComplete(plan, planIndex, dateStr, progress)) continue
            val day = plan.workoutPlan?.weeklyPlan?.getOrNull(planIndex) ?: continue
            return NextWorkoutPreviewDto(
                planIndex = planIndex,
                day = day.day,
                focus = day.focus,
                scheduledDate = dateStr,
                mainExercises = day.exercises.map { it.name.trim() }.filter { it.isNotEmpty() },
            )
        }
        return null
    }

    private fun allExerciseNames(day: com.refactor.app.api.dto.WorkoutDayDto): List<String> {
        val names = mutableListOf<String>()
        day.warmups.orEmpty().forEach { if (it.name.isNotBlank()) names.add(it.name) }
        day.exercises.forEach { if (it.name.isNotBlank()) names.add(it.name) }
        day.finishers.orEmpty().forEach { if (it.name.isNotBlank()) names.add(it.name) }
        return names
    }

    private fun withinDays(date: String, today: String, days: Int): Boolean {
        val d = parseDate(date) ?: return false
        val t = parseDate(today) ?: return false
        return !d.isBefore(t.minusDays(days.toLong()))
    }

    private fun parseDate(raw: String): LocalDate? =
        try {
            LocalDate.parse(raw.take(10))
        } catch (_: DateTimeParseException) {
            null
        }
}

internal data class WorkoutLearningContextFields(
    val completedWorkoutToday: CompletedSessionSummaryDto? = null,
    val workoutHistory: WorkoutHistorySummaryDto? = null,
    val nextWorkout: NextWorkoutPreviewDto? = null,
)
