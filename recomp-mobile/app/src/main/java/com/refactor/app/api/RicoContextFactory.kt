package com.refactor.app.api

import com.refactor.app.api.dto.RicoContextDto
import com.refactor.app.api.dto.RicoExerciseDto
import com.refactor.app.api.dto.RicoWorkoutDayDto
import com.refactor.app.api.dto.RicoWorkoutPlanDto
import com.refactor.app.api.dto.SyncGetResponse
import java.time.LocalDate
import java.time.format.DateTimeParseException

internal object RicoContextFactory {

    /** Builds Rico `/api/rico` context from cached sync JSON (same fields as iOS `RicoContextPayload`). */
    fun fromPayloadJson(raw: String): RicoContextDto? {
        val snap = runCatching { SyncJson.format.decodeFromString<SyncGetResponse>(raw) }.getOrNull()
            ?: return null
        val profile = snap.profile
        val meals = snap.meals.orEmpty()
        val today = LocalDate.now().toString()
        val mealsLogged = meals.count { normalizeMealDate(it.date) == today }
        val streak = streakLength(meals.map { it.date })
        val wp = snap.plan?.workoutPlan?.weeklyPlan?.let { days ->
            RicoWorkoutPlanDto(
                weeklyPlan = days.map { d ->
                    RicoWorkoutDayDto(
                        day = d.day,
                        focus = d.focus,
                        warmups = d.warmups?.map { RicoExerciseDto(it.name, it.sets, it.reps, it.notes) },
                        exercises = d.exercises.map { RicoExerciseDto(it.name, it.sets, it.reps, it.notes) },
                        finishers = d.finishers?.map { RicoExerciseDto(it.name, it.sets, it.reps, it.notes) },
                    )
                },
            )
        }
        return RicoContextDto(
            name = profile.name,
            goal = profile.goal,
            streak = streak,
            mealsLogged = mealsLogged,
            xp = snap.meta?.xp,
            workoutPlan = wp,
            equipment = profile.workoutEquipment.takeIf { it.isNotEmpty() },
            injuries = profile.injuriesOrLimitations.takeIf { it.isNotEmpty() },
            dietaryRestrictions = profile.dietaryRestrictions.takeIf { it.isNotEmpty() },
        )
    }

    private fun normalizeMealDate(raw: String): String =
        raw.trim().take(10)

    private fun parseLocalDate(raw: String): LocalDate? =
        try {
            LocalDate.parse(normalizeMealDate(raw))
        } catch (_: DateTimeParseException) {
            null
        }

    /** Consecutive days with logs ending today (matches typical coach context). */
    private fun streakLength(dateStrings: List<String>): Int {
        val distinct = dateStrings.mapNotNull { parseLocalDate(it) }.toSet()
        if (distinct.isEmpty()) return 0
        var d = LocalDate.now()
        var n = 0
        while (distinct.contains(d)) {
            n++
            d = d.minusDays(1)
        }
        return n
    }
}
