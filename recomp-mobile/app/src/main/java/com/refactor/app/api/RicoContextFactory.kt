package com.refactor.app.api

import com.refactor.app.api.dto.RicoContextDto
import com.refactor.app.api.dto.RicoExerciseDto
import com.refactor.app.api.dto.RicoMacroSummaryDto
import com.refactor.app.api.dto.RicoMealSummaryDto
import com.refactor.app.api.dto.RicoWorkoutDayDto
import com.refactor.app.api.dto.RicoWorkoutPlanDto
import com.refactor.app.api.dto.SyncGetResponse
import java.time.LocalDate
import java.time.format.DateTimeParseException
import kotlin.math.max

internal object RicoContextFactory {

    /** Builds Rico `/api/rico` context from cached sync JSON (same fields as iOS `RicoContextPayload`). */
    fun fromPayloadJson(raw: String): RicoContextDto? {
        val snap = runCatching { SyncJson.format.decodeFromString<SyncGetResponse>(raw) }.getOrNull()
            ?: return null
        val profile = snap.profile
        val meals = snap.meals.orEmpty()
        val today = LocalDate.now().toString()
        val todayMeals = meals.filter { normalizeMealDate(it.date) == today }
        val mealsLogged = todayMeals.size
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

        val recentMeals = todayMeals.takeIf { it.isNotEmpty() }?.map { m ->
            RicoMealSummaryDto(
                name = m.name,
                mealType = m.mealType,
                calories = m.macros.calories,
                protein = m.macros.protein,
                carbs = m.macros.carbs,
                fat = m.macros.fat,
            )
        }

        val todayMacros = todayMeals.takeIf { it.isNotEmpty() }?.let {
            RicoMacroSummaryDto(
                calories = it.sumOf { meal -> meal.macros.calories },
                protein = it.sumOf { meal -> meal.macros.protein },
                carbs = it.sumOf { meal -> meal.macros.carbs },
                fat = it.sumOf { meal -> meal.macros.fat },
            )
        }

        val macroTargets = snap.plan?.dietPlan?.dailyTargets?.let { t ->
            RicoMacroSummaryDto(
                calories = t.calories,
                protein = t.protein,
                carbs = t.carbs,
                fat = t.fat,
            )
        }

        val remainingMacros = if (macroTargets != null && todayMacros != null) {
            RicoMacroSummaryDto(
                calories = max(0.0, macroTargets.calories - todayMacros.calories),
                protein = max(0.0, macroTargets.protein - todayMacros.protein),
                carbs = max(0.0, macroTargets.carbs - todayMacros.carbs),
                fat = max(0.0, macroTargets.fat - todayMacros.fat),
            )
        } else {
            null
        }

        val saved = snap.savedRecipes.orEmpty()
        val savedRecipes = saved.take(30).takeIf { it.isNotEmpty() }
        val bodyWeight = snap.wearableData.orEmpty()
            .sortedByDescending { it.date }
            .firstNotNullOfOrNull { it.weight }

        val learning = WorkoutLearning.buildRicoContextFields(
            plan = snap.plan,
            progress = snap.workoutProgress.orEmpty(),
        )

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
            recentMeals = recentMeals,
            todayMacros = todayMacros,
            macroTargets = macroTargets,
            remainingMacros = remainingMacros,
            savedRecipeCount = saved.takeIf { it.isNotEmpty() }?.size,
            savedRecipeNames = saved.take(8).map { it.name }.takeIf { it.isNotEmpty() },
            savedRecipes = savedRecipes,
            bodyWeight = bodyWeight,
            completedWorkoutToday = learning.completedWorkoutToday,
            workoutHistory = learning.workoutHistory,
            nextWorkout = learning.nextWorkout,
            today = today,
            timezoneOffsetMinutes = -java.util.TimeZone.getDefault().getOffset(System.currentTimeMillis()) / 60_000,
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
