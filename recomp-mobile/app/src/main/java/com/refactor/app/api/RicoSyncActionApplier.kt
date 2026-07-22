package com.refactor.app.api

import android.util.Log
import com.refactor.app.api.dto.RicoToolActionWire
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.temporal.TemporalAdjusters
import java.util.UUID

/**
 * Applies Rico/Bedrock tool actions to a GET-shaped sync JSON root (same intent as web `processRicoActions` / iOS `CoachService.applyActions`).
 */
internal object RicoSyncActionApplier {
    private const val TAG = "RicoSyncActionApplier"

    fun apply(root: JsonObject, actions: List<RicoToolActionWire>): RicoApplyOutcome {
        var current = root
        var result = RicoApplyResult()
        for (action in actions) {
            val step = when (action.type) {
                "log_meal" -> applyLogMeal(current, action.payload)
                "update_macros" -> applyUpdateMacros(current, action.payload)
                "swap_exercise" -> applySwapExercise(current, action.payload)
                "add_exercise" -> applyAddExercise(current, action.payload)
                "update_workout_day" -> applyUpdateWorkoutDay(current, action.payload)
                "adjust_program_start" -> applyAdjustProgramStart(current, action.payload)
                else -> StepOutcome(current, applied = false, skipReason = "unsupported on this client")
            }
            current = step.root
            result = if (step.applied) {
                val next = result.recordApplied(action.type)
                when (action.type) {
                    "log_meal" -> next.copy(touchedMeals = true)
                    else -> next.copy(touchedPlan = true)
                }
            } else {
                result.recordSkipped(action.type, step.skipReason ?: "no change")
            }
        }
        for (skip in result.skipped) {
            Log.i(TAG, "Rico action skipped type=${skip.type} reason=${skip.reason}")
        }
        return RicoApplyOutcome(current, result)
    }

    private data class StepOutcome(
        val root: JsonObject,
        val applied: Boolean,
        val skipReason: String? = null,
    )

    private fun applyLogMeal(root: JsonObject, payload: JsonObject): StepOutcome {
        val existing = root["meals"]?.jsonArray?.toMutableList() ?: mutableListOf()
        val today = LocalDate.now().toString()
        val macros = buildJsonObject {
            put("calories", JsonPrimitive(payload.doubleOr("calories").toInt()))
            put("protein", JsonPrimitive(payload.doubleOr("protein")))
            put("carbs", JsonPrimitive(payload.doubleOr("carbs")))
            put("fat", JsonPrimitive(payload.doubleOr("fat")))
        }
        val meal = buildJsonObject {
            put("id", JsonPrimitive(payload.stringOr("id") ?: UUID.randomUUID().toString()))
            put("date", JsonPrimitive(payload.stringOr("date") ?: today))
            put("mealType", JsonPrimitive(parseMealType(payload)))
            put("name", JsonPrimitive(payload.stringOr("name") ?: "Meal"))
            put("loggedAt", JsonPrimitive(Instant.now().toString()))
            put("macros", macros)
        }
        existing.add(meal)
        return StepOutcome(root.replaceTopLevel("meals", JsonArray(existing)), applied = true)
    }

    private fun applyUpdateMacros(root: JsonObject, payload: JsonObject): StepOutcome {
        val plan = root["plan"]?.jsonObject
            ?: return StepOutcome(root, applied = false, skipReason = "no plan")
        val diet = plan["dietPlan"]?.jsonObject
            ?: return StepOutcome(root, applied = false, skipReason = "no diet plan")
        val targets = buildJsonObject {
            put("calories", JsonPrimitive(payload.doubleOr("calories").toInt()))
            put("protein", JsonPrimitive(payload.doubleOr("protein")))
            put("carbs", JsonPrimitive(payload.doubleOr("carbs")))
            put("fat", JsonPrimitive(payload.doubleOr("fat")))
        }
        val newDiet = diet.replaceKey("dailyTargets", targets)
        val newPlan = plan.replaceKey("dietPlan", newDiet)
        return StepOutcome(root.replaceTopLevel("plan", newPlan), applied = true)
    }

    private fun applySwapExercise(root: JsonObject, payload: JsonObject): StepOutcome {
        val dayLabel = payload.stringOr("day")
            ?: return StepOutcome(root, applied = false, skipReason = "missing day")
        val oldName = payload.stringOr("oldExerciseName")
            ?: return StepOutcome(root, applied = false, skipReason = "missing oldExerciseName")
        val newName = payload.stringOr("newExerciseName")
            ?: return StepOutcome(root, applied = false, skipReason = "missing newExerciseName")
        val section = (payload.stringOr("section") ?: "exercises").lowercase()
        val newEx = buildJsonObject {
            put("name", JsonPrimitive(newName))
            put("sets", JsonPrimitive(payload.stringOr("newSets") ?: "3"))
            put("reps", JsonPrimitive(payload.stringOr("newReps") ?: "10"))
            payload["newNotes"]?.let { put("notes", it) }
        }
        val updated = mutateWeeklyPlanDay(root, dayLabel) { dayObj ->
            when (section) {
                "warmups" -> dayObj.replaceExerciseInList("warmups", oldName, newEx)
                "finishers" -> dayObj.replaceExerciseInList("finishers", oldName, newEx)
                else -> dayObj.replaceExerciseInList("exercises", oldName, newEx)
            }
        } ?: return StepOutcome(root, applied = false, skipReason = "day or exercise not found: $dayLabel / $oldName")
        return StepOutcome(updated, applied = true)
    }

    private fun JsonObject.replaceExerciseInList(
        listKey: String,
        oldName: String,
        newExercise: JsonObject,
    ): JsonObject? {
        val arr = this[listKey]?.jsonArray ?: return null
        val list = arr.toMutableList()
        val idx = list.indexOfFirst {
            it.jsonObject.stringOr("name")?.equals(oldName, ignoreCase = true) == true
        }
        if (idx < 0) return null
        list[idx] = newExercise
        return replaceKey(listKey, JsonArray(list))
    }

    private fun applyAddExercise(root: JsonObject, payload: JsonObject): StepOutcome {
        val dayLabel = payload.stringOr("day")
            ?: return StepOutcome(root, applied = false, skipReason = "missing day")
        val exName = payload.stringOr("exerciseName")
            ?: return StepOutcome(root, applied = false, skipReason = "missing exerciseName")
        val section = (payload.stringOr("section") ?: "exercises").lowercase()
        val newEx = buildJsonObject {
            put("name", JsonPrimitive(exName))
            put("sets", JsonPrimitive(payload.stringOr("sets") ?: "3"))
            put("reps", JsonPrimitive(payload.stringOr("reps") ?: "10"))
            payload["notes"]?.let { put("notes", it) }
        }
        val updated = mutateWeeklyPlanDay(root, dayLabel) { dayObj ->
            val key = when (section) {
                "warmups" -> "warmups"
                "finishers" -> "finishers"
                else -> "exercises"
            }
            val arr = dayObj[key]?.jsonArray?.toMutableList() ?: mutableListOf()
            arr.add(newEx)
            dayObj.replaceKey(key, JsonArray(arr))
        } ?: return StepOutcome(root, applied = false, skipReason = "day not found: $dayLabel")
        return StepOutcome(updated, applied = true)
    }

    private fun applyAdjustProgramStart(root: JsonObject, payload: JsonObject): StepOutcome {
        val startDate = payload.stringOr("startDate")
            ?: return StepOutcome(root, applied = false, skipReason = "missing startDate")
        if (!startDate.matches(Regex("^\\d{4}-\\d{2}-\\d{2}$"))) {
            return StepOutcome(root, applied = false, skipReason = "invalid startDate")
        }
        val anchor = runCatching {
            LocalDate.parse(startDate).with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).toString()
        }.getOrNull() ?: return StepOutcome(root, applied = false, skipReason = "invalid startDate")
        val plan = root["plan"]?.jsonObject
            ?: return StepOutcome(root, applied = false, skipReason = "no plan")
        val workoutPlan = plan["workoutPlan"]?.jsonObject
            ?: return StepOutcome(root, applied = false, skipReason = "no workout plan")
        var newWorkoutPlan = workoutPlan.replaceKey("programWeek1Start", JsonPrimitive(anchor))
        newWorkoutPlan = newWorkoutPlan.replaceKey("programWeekOffset", JsonPrimitive(0))
        newWorkoutPlan = newWorkoutPlan.replaceKey("missedSessions", JsonArray(emptyList()))
        newWorkoutPlan = newWorkoutPlan.replaceKey("catchUpBannerDismissedAt", JsonNull)
        val newPlan = plan.replaceKey("workoutPlan", newWorkoutPlan)
        return StepOutcome(root.replaceTopLevel("plan", newPlan), applied = true)
    }

    private fun applyUpdateWorkoutDay(root: JsonObject, payload: JsonObject): StepOutcome {
        val dayLabel = payload.stringOr("day")
            ?: return StepOutcome(root, applied = false, skipReason = "missing day")
        val focus = payload.stringOr("focus")
            ?: return StepOutcome(root, applied = false, skipReason = "missing focus")
        val updated = mutateWeeklyPlanDay(root, dayLabel) { dayObj ->
            var d = dayObj.replaceKey("focus", JsonPrimitive(focus))
            coerceExerciseArray(payload["warmups"])?.let { d = d.replaceKey("warmups", it) }
            coerceExerciseArray(payload["exercises"])?.let { d = d.replaceKey("exercises", it) }
            coerceExerciseArray(payload["finishers"])?.let { d = d.replaceKey("finishers", it) }
            d
        } ?: return StepOutcome(root, applied = false, skipReason = "day not found: $dayLabel")
        return StepOutcome(updated, applied = true)
    }

    private fun parseMealType(payload: JsonObject): String {
        val raw = payload.stringOr("mealType")?.lowercase()
        return when (raw) {
            "breakfast", "lunch", "dinner", "snack" -> raw
            else -> "snack"
        }
    }

    private fun coerceExerciseArray(el: JsonElement?): JsonArray? {
        if (el == null) return null
        return when (el) {
            is JsonArray -> el
            is JsonObject -> JsonArray(listOf(el))
            else -> null
        }
    }

    private fun mutateWeeklyPlanDay(
        root: JsonObject,
        dayLabel: String,
        fn: (JsonObject) -> JsonObject?,
    ): JsonObject? {
        val plan = root["plan"]?.jsonObject ?: return null
        val workoutPlan = plan["workoutPlan"]?.jsonObject ?: return null
        val weeklyArr = workoutPlan["weeklyPlan"]?.jsonArray ?: return null
        val weekly = weeklyArr.toMutableList()
        val idx = weekly.indexOfFirst {
            it.jsonObject.stringOr("day")?.equals(dayLabel, ignoreCase = true) == true
        }
        if (idx < 0) return null
        val updatedDay = fn(weekly[idx].jsonObject) ?: return null
        weekly[idx] = updatedDay
        val newWorkoutPlan = workoutPlan.replaceKey("weeklyPlan", JsonArray(weekly))
        val newPlan = plan.replaceKey("workoutPlan", newWorkoutPlan)
        return root.replaceTopLevel("plan", newPlan)
    }

    private fun JsonObject.replaceTopLevel(key: String, value: JsonElement): JsonObject =
        buildJsonObject {
            entries.forEach { (k, v) ->
                if (k != key) put(k, v)
            }
            put(key, value)
        }

    private fun JsonObject.replaceKey(key: String, value: JsonElement): JsonObject =
        buildJsonObject {
            entries.forEach { (k, v) ->
                if (k != key) put(k, v)
            }
            put(key, value)
        }

    private fun JsonObject.stringOr(key: String): String? =
        this[key]?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotBlank() }

    private fun JsonObject.doubleOr(key: String): Double {
        val p = this[key]?.jsonPrimitive ?: return 0.0
        p.doubleOrNull?.let { return it }
        p.intOrNull?.let { return it.toDouble() }
        return 0.0
    }
}
