package com.refactor.app.domain

import com.refactor.app.api.dto.FitnessPlanDto
import com.refactor.app.api.dto.MealMacrosDto
import com.refactor.app.api.dto.WorkoutDayDto
import com.refactor.app.ui.workouts.WorkoutProgramSchedule
import java.time.LocalDate

enum class WeekdayKey(val key: String, val shortLabel: String) {
    Mon("mon", "Mon"),
    Tue("tue", "Tue"),
    Wed("wed", "Wed"),
    Thu("thu", "Thu"),
    Fri("fri", "Fri"),
    Sat("sat", "Sat"),
    Sun("sun", "Sun");

    companion object {
        fun from(date: LocalDate): WeekdayKey = when (date.dayOfWeek.value) {
            1 -> Mon
            2 -> Tue
            3 -> Wed
            4 -> Thu
            5 -> Fri
            6 -> Sat
            7 -> Sun
            else -> Mon
        }

        val all: List<WeekdayKey> = entries
    }
}

object WeekdayMacros {

    private fun isRestFocus(focus: String): Boolean {
        val f = focus.lowercase()
        return f.contains("rest") || f.contains("recovery") || f.contains("off")
    }

    private fun dayLabelToKey(dayLabel: String): WeekdayKey? {
        val p = dayLabel.lowercase().trim()
        return when {
            p.startsWith("mon") -> WeekdayKey.Mon
            p.startsWith("tue") -> WeekdayKey.Tue
            p.startsWith("wed") -> WeekdayKey.Wed
            p.startsWith("thu") -> WeekdayKey.Thu
            p.startsWith("fri") -> WeekdayKey.Fri
            p.startsWith("sat") -> WeekdayKey.Sat
            p.startsWith("sun") -> WeekdayKey.Sun
            else -> null
        }
    }

    private fun trainingRestPair(diet: com.refactor.app.api.dto.DietPlanSectionDto): Pair<MealMacrosDto, MealMacrosDto> {
        val base = diet.dailyTargets ?: MealMacrosDto()
        val training = diet.trainingTargets?.takeIf { it.calories > 0 }
            ?: MealMacrosDto(
                calories = base.calories + 200,
                protein = base.protein,
                carbs = base.carbs + 50,
                fat = base.fat,
            )
        val rest = diet.restTargets?.takeIf { it.calories > 0 }
            ?: MealMacrosDto(
                calories = maxOf(0.0, base.calories - 200),
                protein = base.protein,
                carbs = maxOf(0.0, base.carbs - 50),
                fat = base.fat,
            )
        return training to rest
    }

    fun hasExplicit(weekdayTargets: Map<String, MealMacrosDto>?): Boolean =
        weekdayTargets?.any { (it.value.calories) > 0 } == true

    fun legacyTargets(plan: FitnessPlanDto, date: LocalDate): MealMacrosDto {
        val diet = plan.dietPlan ?: return MealMacrosDto(calories = 2000.0, protein = 150.0, carbs = 200.0, fat = 65.0)
        val fallback = diet.dailyTargets ?: MealMacrosDto()
        val (training, rest) = trainingRestPair(diet)
        val idx = WorkoutProgramSchedule.planIndexForDate(plan, date)
        if (idx != null) {
            val w = plan.workoutPlan?.weeklyPlan?.getOrNull(idx)
            if (w != null) return if (isRestFocus(w.focus)) rest else training
        }
        return if (rest.calories > 0) rest else fallback.takeIf { it.calories > 0 }
            ?: MealMacrosDto(calories = 2000.0, protein = 150.0, carbs = 200.0, fat = 65.0)
    }

    fun resolve(plan: FitnessPlanDto, date: LocalDate): MealMacrosDto {
        val key = WeekdayKey.from(date).key
        val weekday = plan.dietPlan?.weekdayTargets?.get(key)
        if (weekday != null && weekday.calories > 0) return weekday
        return legacyTargets(plan, date)
    }

    fun effectiveWeekdayMap(plan: FitnessPlanDto): Map<WeekdayKey, MealMacrosDto> {
        val diet = plan.dietPlan ?: return WeekdayKey.all.associateWith {
            MealMacrosDto(calories = 2000.0, protein = 150.0, carbs = 200.0, fat = 65.0)
        }
        val base = diet.dailyTargets ?: MealMacrosDto()
        val (training, rest) = trainingRestPair(diet)
        val stored = diet.weekdayTargets

        if (hasExplicit(stored)) {
            return WeekdayKey.all.associateWith { key ->
                stored?.get(key.key)?.takeIf { it.calories > 0 } ?: base
            }
        }

        val out = WeekdayKey.all.associateWith { rest }.toMutableMap()
        val wp = plan.workoutPlan?.weeklyPlan.orEmpty()
        for (day in wp) {
            val key = dayLabelToKey(day.day) ?: continue
            out[key] = if (isRestFocus(day.focus)) rest else training
        }
        if (wp.isNotEmpty() && wp.none { dayLabelToKey(it.day) != null }) {
            val order = listOf(WeekdayKey.Mon, WeekdayKey.Tue, WeekdayKey.Wed, WeekdayKey.Thu, WeekdayKey.Fri, WeekdayKey.Sat, WeekdayKey.Sun)
            for (i in wp.indices) {
                if (i >= order.size) break
                out[order[i]] = if (isRestFocus(wp[i].focus)) rest else training
            }
        }
        return out
    }

    fun seedFromSchedule(
        training: MealMacrosDto,
        rest: MealMacrosDto,
        workoutDays: List<WorkoutDayDto>,
    ): Map<String, MealMacrosDto> {
        val out = WeekdayKey.all.associate { it.key to rest }.toMutableMap()
        for (day in workoutDays) {
            val key = dayLabelToKey(day.day) ?: continue
            out[key.key] = if (isRestFocus(day.focus)) rest else training
        }
        if (workoutDays.isNotEmpty() && workoutDays.none { dayLabelToKey(it.day) != null }) {
            val order = listOf(WeekdayKey.Mon, WeekdayKey.Tue, WeekdayKey.Wed, WeekdayKey.Thu, WeekdayKey.Fri, WeekdayKey.Sat, WeekdayKey.Sun)
            for (i in workoutDays.indices) {
                if (i >= order.size) break
                out[order[i].key] = if (isRestFocus(workoutDays[i].focus)) rest else training
            }
        }
        return out
    }

    fun average(map: Map<String, MealMacrosDto>): MealMacrosDto {
        var cal = 0.0
        var pro = 0.0
        var carb = 0.0
        var fat = 0.0
        for (key in WeekdayKey.all) {
            val m = map[key.key] ?: MealMacrosDto()
            cal += m.calories
            pro += m.protein
            carb += m.carbs
            fat += m.fat
        }
        val n = WeekdayKey.all.size.toDouble()
        return MealMacrosDto(cal / n, pro / n, carb / n, fat / n)
    }
}
