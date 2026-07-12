package com.refactor.app.api.dto

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.intOrNull

data class RegeneratePlanOptions(
    val programWeeks: Int? = null,
    val workoutDaysPerWeek: Int? = null,
    val reason: String? = null,
) {
    companion object {
        fun fromPayload(payload: JsonObject): RegeneratePlanOptions =
            RegeneratePlanOptions(
                programWeeks = payload["programWeeks"]?.jsonPrimitive?.intOrNull?.coerceIn(1, 12),
                workoutDaysPerWeek = payload["workoutDaysPerWeek"]?.jsonPrimitive?.intOrNull?.coerceIn(2, 7),
                reason = payload["reason"]?.jsonPrimitive?.content?.takeIf { it.isNotBlank() },
            )
    }
}

@Serializable
data class GenerateWorkoutsProfileDto(
    val name: String,
    val goal: String,
    val fitnessLevel: String,
    val workoutLocation: String? = null,
    val workoutEquipment: List<String>? = null,
    val injuriesOrLimitations: List<String>? = null,
    val workoutDaysPerWeek: Int,
)

@Serializable
data class GenerateWorkoutsRequestDto(
    val fromWeek: Int,
    val toWeek: Int,
    val programWeeks: Int,
    val workoutDaysPerWeek: Int,
    val week1Template: List<WorkoutDayDto>,
    val reason: String? = null,
    val profile: GenerateWorkoutsProfileDto,
)

@Serializable
data class GenerateWorkoutsResponseDto(
    val workoutDays: List<WorkoutDayDto> = emptyList(),
    val error: String? = null,
)
