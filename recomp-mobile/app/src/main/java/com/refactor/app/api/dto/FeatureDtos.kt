package com.refactor.app.api.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class GroupMembershipDto(
    val groupId: String,
    val groupName: String,
    val role: String,
    val joinedAt: String,
)

@Serializable
data class GroupDto(
    val id: String,
    val name: String,
    val description: String = "",
    val goalType: String,
    val goalDescription: String? = null,
    val accessMode: String = "open",
    val trackingMode: String = "both",
    val inviteCode: String? = null,
    val creatorId: String = "",
    val memberCount: Int = 0,
    val createdAt: String = "",
)

@Serializable
data class GroupDetailResponseDto(
    val group: GroupDto,
    val members: List<GroupMembershipDto> = emptyList(),
)

@Serializable
data class GroupMessageDto(
    val id: String,
    val authorId: String,
    val authorName: String,
    val authorAvatarUrl: String? = null,
    val text: String,
    val createdAt: String,
    val pinnedAt: String? = null,
)

@Serializable
data class ChallengeParticipantDto(
    val userId: String,
    val name: String,
    val progress: Double = 0.0,
    val score: Double = 0.0,
)

@Serializable
data class ChallengeDto(
    val id: String,
    val type: String = "solo",
    val title: String,
    val description: String = "",
    val metric: String,
    val target: Double,
    val startDate: String,
    val endDate: String,
    val stakes: String? = null,
    val participants: List<ChallengeParticipantDto> = emptyList(),
    val status: String = "pending",
    val createdBy: String = "",
    val groupId: String? = null,
    val myProgress: Double? = null,
    val myScore: Double? = null,
)

@Serializable
data class GroupMemberProgressDto(
    val userId: String,
    val name: String,
    val avatarDataUrl: String? = null,
    val xp: Int = 0,
    val xpLevel: Int = 0,
    val streakLength: Int = 0,
    val weeksActive: Int = 0,
    val macroHitRate: Double = 0.0,
    val updatedAt: String = "",
)

@Serializable
data class ResearchResponseDto(
    val answer: String,
    val sources: List<ResearchSourceDto>? = null,
)

@Serializable
data class ResearchSourceDto(
    val title: String,
    val url: String,
)

@Serializable
data class MealPrepIngredientDto(
    val name: String,
    val amount: String,
    val category: String = "",
)

@Serializable
data class MealPrepRecipeDto(
    val name: String,
    val servings: Int = 1,
    val macrosPerServing: MealMacrosDto = MealMacrosDto(),
    val ingredients: List<MealPrepIngredientDto> = emptyList(),
    val instructions: List<String> = emptyList(),
    val prepTime: Int = 0,
    val cookTime: Int = 0,
)

@Serializable
data class MealPrepGenerateResponseDto(
    val recipes: List<MealPrepRecipeDto> = emptyList(),
    val batchInstructions: List<String> = emptyList(),
    val estimatedPrepTime: Int = 0,
)

@Serializable
data class GroceryItemDto(
    val item: String,
    val amount: String,
    val category: String = "other",
    val checked: Boolean = false,
)

@Serializable
data class ExerciseSearchResultDto(
    @SerialName("exerciseId") val id: String = "",
    val name: String = "",
    val gifUrl: String? = null,
    val targetMuscles: List<String>? = null,
    val instructions: List<String>? = null,
)

@Serializable
data class RecoveryModifiedWorkoutDto(
    val volumeAdjustment: Double = 1.0,
    val intensityAdjustment: Double = 1.0,
    val suggestedSwaps: List<RecoverySwapDto> = emptyList(),
)

@Serializable
data class RecoverySwapDto(
    val original: String,
    val replacement: String,
)

@Serializable
data class RecoveryAssessmentDto(
    val score: Double = 0.0,
    val level: String = "moderate",
    val recommendation: String = "",
    val modifiedWorkout: RecoveryModifiedWorkoutDto? = null,
)

@Serializable
data class PlaylistSuggestionDto(
    val name: String,
    val description: String = "",
    val provider: String = "spotify",
    val deepLink: String,
    val bpm: String = "",
    val mood: String = "",
)

@Serializable
data class MusicSuggestResponseDto(
    val suggestions: List<PlaylistSuggestionDto> = emptyList(),
)

/** POST /api/macros/calculate — recalculates macro targets server-side (same calculator as plan generation). */
@Serializable
data class MacrosCalculatePayloadDto(
    val weightKg: Double? = null,
    val heightCm: Double? = null,
    val age: Int? = null,
    val gender: String? = null,
    val dailyActivityLevel: String? = null,
    val goal: String? = null,
    val learnedTDEE: Double? = null,
)

@Serializable
data class MacrosCalculateResponseDto(
    val macros: MealMacrosDto = MealMacrosDto(),
)

@Serializable
data class AdjustMacrosDto(
    val calories: Int = 0,
    val protein: Double = 0.0,
    val carbs: Double = 0.0,
    val fat: Double = 0.0,
)

@Serializable
data class AdjustSuggestionDto(
    val explanation: String = "",
    val newTargets: AdjustMacrosDto? = null,
    val changes: List<String>? = null,
)

@Serializable
data class AdjustResponseDto(
    val suggestion: AdjustSuggestionDto,
)

@Serializable
data class AdjustMealDto(
    val date: String,
    val name: String,
    val mealType: String,
    val calories: Double,
    val protein: Double,
    val carbs: Double,
    val fat: Double,
)

@Serializable
data class AdjustDietPlanDto(
    val dailyTargets: AdjustMacrosDto = AdjustMacrosDto(),
    val trainingTargets: AdjustMacrosDto? = null,
    val restTargets: AdjustMacrosDto? = null,
)

@Serializable
data class AdjustPlanDto(
    val id: String = "",
    val userId: String = "",
    val createdAt: String = "",
    val dietPlan: AdjustDietPlanDto = AdjustDietPlanDto(),
)

@Serializable
data class AdjustPayloadDto(
    val feedback: String,
    val plan: AdjustPlanDto? = null,
    val mealsThisWeek: List<AdjustMealDto> = emptyList(),
    val avgDailyCalories: Double? = null,
    val avgDailyProtein: Double? = null,
)

// ─── Progress / insights ────────────────────────────────────────────────────

@Serializable
data class BiofeedbackRowPayloadDto(
    val date: String,
    val time: String = "",
    val energy: Int = 0,
    val mood: Int = 0,
    val hunger: Int = 0,
    val stress: Int = 0,
    val soreness: Int = 0,
)

@Serializable
data class MealInsightRowDto(
    val date: String,
    val name: String = "",
    val calories: Double = 0.0,
    val protein: Double = 0.0,
    val carbs: Double = 0.0,
    val fat: Double = 0.0,
)

@Serializable
data class WearableInsightRowDto(
    val date: String,
    val provider: String = "",
    val steps: Int? = null,
    val caloriesBurned: Double? = null,
    val sleepScore: Int? = null,
)

@Serializable
data class BiofeedbackInsightsPayloadDto(
    val biofeedback: List<BiofeedbackRowPayloadDto> = emptyList(),
    val meals: List<MealInsightRowDto> = emptyList(),
    val wearableData: List<WearableInsightRowDto> = emptyList(),
)

@Serializable
data class BiofeedbackCorrelationDto(
    val factor: String = "",
    val observation: String = "",
    val strength: String = "",
)

@Serializable
data class BiofeedbackInsightsResponseDto(
    val correlations: List<BiofeedbackCorrelationDto> = emptyList(),
    val recommendations: List<String> = emptyList(),
)

@Serializable
data class WeeklyReviewTargetsDto(
    val calories: Int = 2000,
    val protein: Double = 150.0,
    val carbs: Double = 200.0,
    val fat: Double = 65.0,
)

@Serializable
data class WeeklyReviewPayloadDto(
    val meals: List<MealInsightRowDto> = emptyList(),
    val wearableData: List<WearableInsightRowDto> = emptyList(),
    val targets: WeeklyReviewTargetsDto? = null,
    val goal: String = "maintain",
    val userName: String = "Athlete",
)

@Serializable
data class WeeklyReviewDto(
    val summary: String = "",
    val mealAnalysis: String = "",
    val wearableInsights: String = "",
    val recommendations: List<String> = emptyList(),
    val weeklyScore: Int? = null,
    val reasoning: String? = null,
)

@Serializable
data class ScaleEntryPayloadDto(
    val date: String,
    val weightLbs: Double? = null,
    val bodyFatPercent: Double? = null,
    val muscleMass: Double? = null,
    val bmi: Double? = null,
    val bmr: Double? = null,
    val metabolicAge: Int? = null,
)

@Serializable
data class CoachCheckInBioDto(
    val energy: Int = 3,
    val mood: Int = 3,
    val hunger: Int = 3,
    val stress: Int = 3,
    val soreness: Int = 3,
)

@Serializable
data class CoachCheckInRequestDto(
    val name: String,
    val todayMeals: Int = 0,
    val todayTargets: AdjustMacrosDto = AdjustMacrosDto(),
    val workoutCompleted: Boolean = false,
    val streak: Int = 0,
    val biofeedback: CoachCheckInBioDto? = null,
)

@Serializable
data class CoachCheckInResponseDto(
    val message: String? = null,
    val tone: String? = null,
)

// ── Meal entry / analysis (parity with iOS AddMealSheet) ─────────────────────

@Serializable
data class SuggestedMealDto(
    val name: String,
    val description: String? = null,
    val macros: MealMacrosDto,
    val mealType: String? = null,
)

@Serializable
data class MealSuggestResponseDto(
    val suggestions: List<SuggestedMealDto> = emptyList(),
)

@Serializable
data class NutritionLookupResponseDto(
    val food: String? = null,
    val name: String? = null,
    val nutrition: MealMacrosDto? = null,
    val macros: MealMacrosDto? = null,
    val found: Boolean? = null,
    val error: String? = null,
)

@Serializable
data class RecipeParseResponseDto(
    val name: String,
    val servings: Int? = null,
    val macros: MealMacrosDto,
)

@Serializable
data class VoiceParseResponseDto(
    val name: String? = null,
    val calories: Double? = null,
    val protein: Double? = null,
    val carbs: Double? = null,
    val fat: Double? = null,
    val meals: List<SuggestedMealDto>? = null,
)

// ── P1 health / social ───────────────────────────────────────────────────────

@Serializable
data class SupplementDeficiencyDto(
    val nutrient: String,
    val severity: String,
    val evidence: String,
)

@Serializable
data class SupplementRecommendationDto(
    val action: String,
    val priority: String,
    val reason: String,
)

@Serializable
data class SupplementAnalysisResponseDto(
    val deficiencies: List<SupplementDeficiencyDto> = emptyList(),
    val recommendations: List<SupplementRecommendationDto> = emptyList(),
    val interactions: List<String> = emptyList(),
)

@Serializable
data class BloodWorkParseResponseDto(
    val markers: List<BloodWorkMarkerDto> = emptyList(),
)

@Serializable
data class SocialSettingsDto(
    val visibility: String = "badges_only",
    val username: String? = null,
)

@Serializable
data class UsernameCheckResponseDto(
    val available: Boolean,
)

// ── P2 account tools ─────────────────────────────────────────────────────────

@Serializable
data class ApiTokenResponseDto(
    val token: String,
    val endpoint: String? = null,
    val usage: String? = null,
    val note: String? = null,
)

@Serializable
data class CalendarTokenResponseDto(
    val token: String,
    val feedUrl: String? = null,
)

// ── Recipes ──────────────────────────────────────────────────────────────────

@Serializable
data class ScoredRecipeSuggestionDto(
    val id: String = "",
    val name: String,
    val calories: Int,
    val protein: Int,
    val carbs: Int = 0,
    val fat: Int = 0,
    val recipeUrl: String? = null,
    val source: String? = null,
    val fitScore: Int,
    val fitReason: String,
)

@Serializable
data class RecipeSuggestRequestDto(
    val macroTargets: MealMacrosDto,
    val todayMacros: MealMacrosDto,
    val goal: String? = null,
    val mealType: String? = null,
    val includeDiscover: Boolean = true,
)

@Serializable
data class RecipeSuggestResponseDto(
    val suggestions: List<ScoredRecipeSuggestionDto> = emptyList(),
)

@Serializable
data class RecipeSaveResponseDto(
    val recipe: SavedRecipeDto,
    val savedCount: Int = 0,
)
