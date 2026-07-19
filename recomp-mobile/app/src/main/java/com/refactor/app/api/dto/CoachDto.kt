package com.refactor.app.api.dto

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

@Serializable
data class RicoHistoryMessageDto(
    val role: String,
    val content: String,
    val at: String? = null,
)

@Serializable
data class RicoChatRequest(
    val message: String,
    val context: RicoContextDto? = null,
    val persona: String? = null,
    val history: List<RicoHistoryMessageDto>? = null,
)

@Serializable
data class RicoMealSummaryDto(
    val name: String,
    val mealType: String,
    val calories: Double,
    val protein: Double,
    val carbs: Double,
    val fat: Double,
)

@Serializable
data class RicoMacroSummaryDto(
    val calories: Double = 0.0,
    val protein: Double = 0.0,
    val carbs: Double = 0.0,
    val fat: Double = 0.0,
)

@Serializable
data class RicoContextDto(
    val name: String? = null,
    val goal: String? = null,
    val streak: Int? = null,
    val mealsLogged: Int? = null,
    val xp: Int? = null,
    val workoutPlan: RicoWorkoutPlanDto? = null,
    val equipment: List<String>? = null,
    val injuries: List<String>? = null,
    val dietaryRestrictions: List<String>? = null,
    val recentMeals: List<RicoMealSummaryDto>? = null,
    val todayMacros: RicoMacroSummaryDto? = null,
    val macroTargets: RicoMacroSummaryDto? = null,
    val remainingMacros: RicoMacroSummaryDto? = null,
    val savedRecipeCount: Int? = null,
    val savedRecipeNames: List<String>? = null,
    val savedRecipes: List<SavedRecipeDto>? = null,
    val bodyWeight: Double? = null,
)

@Serializable
data class RicoWorkoutPlanDto(
    val weeklyPlan: List<RicoWorkoutDayDto>,
)

@Serializable
data class RicoWorkoutDayDto(
    val day: String,
    val focus: String,
    val warmups: List<RicoExerciseDto>? = null,
    val exercises: List<RicoExerciseDto>,
    val finishers: List<RicoExerciseDto>? = null,
)

@Serializable
data class RicoExerciseDto(
    val name: String,
    val sets: String,
    val reps: String,
    val notes: String? = null,
)

@Serializable
data class CoachChatResponse(
    val reply: String = "",
    val actions: List<RicoToolActionWire> = emptyList(),
    val recipeSuggestions: List<ScoredRecipeSuggestionDto>? = null,
    val recipeSaved: SavedRecipeDto? = null,
)

@Serializable
data class RicoToolActionWire(
    val type: String,
    val payload: JsonObject = JsonObject(emptyMap()),
)
