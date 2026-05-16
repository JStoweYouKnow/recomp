package com.recomp.app.api

import com.recomp.app.api.dto.RicoToolActionWire
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

/**
 * Applies Rico/Bedrock tool actions to a GET-shaped sync JSON root (same intent as web `processRicoActions` / iOS `CoachService.applyActions`).
 */
internal object RicoSyncActionApplier {

    fun apply(root: JsonObject, actions: List<RicoToolActionWire>): JsonObject {
        var current = root
        for (a in actions) {
            current = when (a.type) {
                "log_meal" -> applyLogMeal(current, a.payload)
                "update_macros" -> applyUpdateMacros(current, a.payload)
                "swap_exercise" -> applySwapExercise(current, a.payload)
                "add_exercise" -> applyAddExercise(current, a.payload)
                "update_workout_day" -> applyUpdateWorkoutDay(current, a.payload)
                else -> current
            }
        }
        return current
    }

    private fun applyLogMeal(root: JsonObject, payload: JsonObject): JsonObject {
        val existing = root["meals"]?.jsonArray?.toMutableList() ?: mutableListOf()
        val today = LocalDate.now().toString()
        val macros = buildJsonObject {
            put("calories", JsonPrimitive(payload.doubleOr("calories").toInt()))
            put("protein", JsonPrimitive(payload.doubleOr("protein")))
            put("carbs", JsonPrimitive(payload.doubleOr("carbs")))
            put("fat", JsonPrimitive(payload.doubleOr("fat")))
        }
        val meal = buildJsonObject {
            put("id", JsonPrimitive(UUID.randomUUID().toString()))
            put("date", JsonPrimitive(today))
            put("mealType", JsonPrimitive("snack"))
            put("name", JsonPrimitive(payload.stringOr("name") ?: "Meal"))
            put("loggedAt", JsonPrimitive(Instant.now().toString()))
            put("macros", macros)
        }
        existing.add(meal)
        return root.replaceTopLevel("meals", JsonArray(existing))
    }

    private fun applyUpdateMacros(root: JsonObject, payload: JsonObject): JsonObject {
        val plan = root["plan"]?.jsonObject ?: return root
        val diet = plan["dietPlan"]?.jsonObject ?: return root
        val targets = buildJsonObject {
            put("calories", JsonPrimitive(payload.doubleOr("calories").toInt()))
            put("protein", JsonPrimitive(payload.doubleOr("protein")))
            put("carbs", JsonPrimitive(payload.doubleOr("carbs")))
            put("fat", JsonPrimitive(payload.doubleOr("fat")))
        }
        val newDiet = diet.replaceKey("dailyTargets", targets)
        val newPlan = plan.replaceKey("dietPlan", newDiet)
        return root.replaceTopLevel("plan", newPlan)
    }

    private fun applySwapExercise(root: JsonObject, payload: JsonObject): JsonObject {
        val dayLabel = payload.stringOr("day") ?: return root
        val oldName = payload.stringOr("oldExerciseName") ?: return root
        val section = (payload.stringOr("section") ?: "exercises").lowercase()
        val newName = payload.stringOr("newExerciseName") ?: return root
        val newEx = buildJsonObject {
            put("name", JsonPrimitive(newName))
            put("sets", JsonPrimitive(payload.stringOr("newSets") ?: "3"))
            put("reps", JsonPrimitive(payload.stringOr("newReps") ?: "10"))
            payload["newNotes"]?.let { put("notes", it) }
        }
        return mutateWeeklyPlanDay(root, dayLabel) { dayObj ->
            when (section) {
                "warmups" -> dayObj.replaceExerciseInList("warmups", oldName, newEx)
                "finishers" -> dayObj.replaceExerciseInList("finishers", oldName, newEx)
                else -> dayObj.replaceExerciseInList("exercises", oldName, newEx)
            }
        }
    }

    private fun JsonObject.replaceExerciseInList(
        listKey: String,
        oldName: String,
        newExercise: JsonObject,
    ): JsonObject {
        val arr = this[listKey]?.jsonArray ?: return this
        val list = arr.toMutableList()
        val idx = list.indexOfFirst {
            it.jsonObject.stringOr("name")?.equals(oldName, ignoreCase = true) == true
        }
        if (idx < 0) return this
        list[idx] = newExercise
        return replaceKey(listKey, JsonArray(list))
    }

    private fun applyAddExercise(root: JsonObject, payload: JsonObject): JsonObject {
        val dayLabel = payload.stringOr("day") ?: return root
        val exName = payload.stringOr("exerciseName") ?: return root
        val section = (payload.stringOr("section") ?: "exercises").lowercase()
        val newEx = buildJsonObject {
            put("name", JsonPrimitive(exName))
            put("sets", JsonPrimitive(payload.stringOr("sets") ?: "3"))
            put("reps", JsonPrimitive(payload.stringOr("reps") ?: "10"))
            payload["notes"]?.let { put("notes", it) }
        }
        return mutateWeeklyPlanDay(root, dayLabel) { dayObj ->
            val key = when (section) {
                "warmups" -> "warmups"
                "finishers" -> "finishers"
                else -> "exercises"
            }
            val arr = dayObj[key]?.jsonArray?.toMutableList() ?: mutableListOf()
            arr.add(newEx)
            dayObj.replaceKey(key, JsonArray(arr))
        }
    }

    private fun applyUpdateWorkoutDay(root: JsonObject, payload: JsonObject): JsonObject {
        val dayLabel = payload.stringOr("day") ?: return root
        val focus = payload.stringOr("focus") ?: return root
        return mutateWeeklyPlanDay(root, dayLabel) { dayObj ->
            var d = dayObj.replaceKey("focus", JsonPrimitive(focus))
            coerceExerciseArray(payload["warmups"])?.let { d = d.replaceKey("warmups", it) }
            coerceExerciseArray(payload["exercises"])?.let { d = d.replaceKey("exercises", it) }
            coerceExerciseArray(payload["finishers"])?.let { d = d.replaceKey("finishers", it) }
            d
        }
    }

    /** Bedrock may emit a single exercise object instead of an array — normalize for sync JSON. */
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
        fn: (JsonObject) -> JsonObject,
    ): JsonObject {
        val plan = root["plan"]?.jsonObject ?: return root
        val workoutPlan = plan["workoutPlan"]?.jsonObject ?: return root
        val weeklyArr = workoutPlan["weeklyPlan"]?.jsonArray ?: return root
        val weekly = weeklyArr.toMutableList()
        val idx = weekly.indexOfFirst {
            it.jsonObject.stringOr("day")?.equals(dayLabel, ignoreCase = true) == true
        }
        if (idx < 0) return root
        val updatedDay = fn(weekly[idx].jsonObject)
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
