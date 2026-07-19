package com.refactor.app.api.dto

import kotlinx.serialization.Serializable

/** Subset of `GET /api/data/sync` — extra keys are ignored by Json config. */
@Serializable
data class MeasurementTargetsDto(
    val targetWeightLbs: Double? = null,
    val targetBodyFatPercent: Double? = null,
    val targetMuscleMassLbs: Double? = null,
)

@Serializable
data class SupplementDto(
    val id: String,
    val name: String,
    val dosage: String = "",
    val frequency: String = "daily",
    val timing: String = "morning",
    val takenToday: Boolean = false,
)

@Serializable
data class BloodWorkMarkerDto(
    val name: String,
    val value: Double,
    val unit: String,
    val normalRange: BloodWorkRangeDto,
    val status: String,
)

@Serializable
data class BloodWorkRangeDto(
    val low: Double,
    val high: Double,
)

@Serializable
data class BloodWorkDto(
    val id: String,
    val date: String,
    val markers: List<BloodWorkMarkerDto> = emptyList(),
    val notes: String? = null,
)

@Serializable
data class SyncMetaDto(
    val xp: Int = 0,
    val hasAdjusted: Boolean? = null,
    val measurementTargets: MeasurementTargetsDto? = null,
)

@Serializable
data class MealMacrosDto(
    val calories: Double = 0.0,
    val protein: Double = 0.0,
    val carbs: Double = 0.0,
    val fat: Double = 0.0,
)

@Serializable
data class MealEntryDto(
    val id: String,
    val date: String,
    val mealType: String,
    val name: String,
    val macros: MealMacrosDto = MealMacrosDto(),
    val notes: String? = null,
    val imageUrl: String? = null,
    val loggedAt: String? = null,
)

@Serializable
data class WorkoutExerciseDto(
    val name: String,
    val sets: String,
    val reps: String,
    val notes: String? = null,
)

@Serializable
data class WorkoutDayDto(
    val day: String,
    val focus: String,
    val warmups: List<WorkoutExerciseDto>? = null,
    val exercises: List<WorkoutExerciseDto> = emptyList(),
    val finishers: List<WorkoutExerciseDto>? = null,
)

@Serializable
data class ParseWorkoutUrlResponseDto(
    val workout: WorkoutDayDto,
    val days: List<WorkoutDayDto>? = null,
    val programTitle: String? = null,
    val dayCount: Int? = null,
    val error: String? = null,
)

@Serializable
data class MissedSessionDto(
    val id: String,
    val planIndex: Int,
    val scheduledDate: String,
    val status: String,
    val rescheduledTo: String? = null,
    val dayLabel: String? = null,
    val focus: String? = null,
)

@Serializable
data class WorkoutPlanSectionDto(
    val weeklyPlan: List<WorkoutDayDto>? = null,
    val tips: List<String>? = null,
    val programWeek1Start: String? = null,
    val advancementMode: String? = null,
    val programWeekOffset: Int? = null,
    val pausedUntil: String? = null,
    val catchUpBannerDismissedAt: String? = null,
    val missedSessions: List<MissedSessionDto>? = null,
)

@Serializable
data class ScheduleAdjustRequestDto(
    val plan: FitnessPlanDto,
    val action: String? = null,
    val workoutProgress: Map<String, String>? = null,
    val useAiRecommendation: Boolean? = null,
    val today: String? = null,
)

@Serializable
data class ScheduleAdjustResponseDto(
    val workoutPlan: WorkoutPlanSectionDto,
    val summary: String,
)

@Serializable
data class DietPlanSectionDto(
    val dailyTargets: MealMacrosDto? = null,
    val trainingTargets: MealMacrosDto? = null,
    val restTargets: MealMacrosDto? = null,
)

/** Mirrors `FitnessPlan` from sync GET (workout + optional diet targets). */
@Serializable
data class FitnessPlanDto(
    val id: String = "",
    val userId: String = "",
    val createdAt: String = "",
    val dietPlan: DietPlanSectionDto? = null,
    val workoutPlan: WorkoutPlanSectionDto? = null,
)

@Serializable
data class HydrationEntryDto(
    val id: String,
    val date: String,
    val time: String,
    val amountMl: Double,
    val source: String? = null,
)

@Serializable
data class FastingSessionDto(
    val id: String,
    val startTime: String,
    val endTime: String? = null,
    val targetHours: Double,
    val protocol: String,
)

@Serializable
data class BiofeedbackEntryDto(
    val id: String,
    val date: String,
    val time: String,
    val energy: Int,
    val mood: Int,
    val hunger: Int,
    val stress: Int,
    val soreness: Int,
    val notes: String? = null,
)

@Serializable
data class PantryItemDto(
    val id: String,
    val name: String,
    val category: String,
    val addedAt: String,
    val expiresAt: String? = null,
)

@Serializable
data class SavedRecipeDto(
    val id: String,
    val name: String,
    val description: String? = null,
    val calories: Int,
    val protein: Int,
    val carbs: Int,
    val fat: Int,
    val recipeUrl: String? = null,
    val source: String? = null,
    val mealTypes: List<String>? = null,
    val servings: Int? = null,
    val addedAt: String,
)

@Serializable
data class ActivityLogEntryDto(
    val id: String,
    val date: String,
    val type: String,
    val label: String,
    val category: String,
    val durationMinutes: Int,
    val calorieAdjustment: Int,
    val loggedAt: String? = null,
)

@Serializable
data class MilestoneDto(
    val id: String,
    val earnedAt: String,
    val progress: Double? = null,
)

@Serializable
data class WearableConnectionDto(
    val provider: String,
    val connectedAt: String,
    val label: String? = null,
)

@Serializable
data class WearableDaySummaryDto(
    val date: String,
    val provider: String,
    val steps: Int? = null,
    val caloriesBurned: Double? = null,
    val sleepScore: Int? = null,
    /** Body mass in pounds (sync contract). */
    val weight: Double? = null,
)

@Serializable
data class MetabolicDataPointDto(
    val date: String,
    val weightKg: Double = 0.0,
    val totalIntake: Double = 0.0,
    val totalExpenditure: Double = 0.0,
)

@Serializable
data class MetabolicModelDto(
    val estimatedTDEE: Int = 0,
    val confidence: Int = 0,
    /** Server sends an array of daily samples; UI uses the count (`dataPoints.size`). */
    val dataPoints: List<MetabolicDataPointDto> = emptyList(),
)

@Serializable
data class SyncGetResponse(
    val profile: UserProfileDto,
    val meta: SyncMetaDto? = null,
    val metabolicModel: MetabolicModelDto? = null,
    val meals: List<MealEntryDto>? = null,
    /** Present when user has a generated plan (`dbGetPlan`). */
    val plan: FitnessPlanDto? = null,
    /** Exercise slot → progress blob (strings; often JSON) from `dbGetWorkoutProgress`. */
    val workoutProgress: Map<String, String>? = null,
    val milestones: List<MilestoneDto>? = null,
    val wearableConnections: List<WearableConnectionDto>? = null,
    val wearableData: List<WearableDaySummaryDto>? = null,
    val hydration: List<HydrationEntryDto>? = null,
    val fastingSessions: List<FastingSessionDto>? = null,
    val biofeedback: List<BiofeedbackEntryDto>? = null,
    val pantry: List<PantryItemDto>? = null,
    val savedRecipes: List<SavedRecipeDto>? = null,
    val mealPrepPlan: MealPrepPlanDto? = null,
    val activityLog: List<ActivityLogEntryDto>? = null,
    val supplements: List<SupplementDto>? = null,
    val bloodWork: List<BloodWorkDto>? = null,
)

/** Weekly meal-prep plan with grocery list; synced so checked-off state follows the user across devices. */
@Serializable
data class MealPrepPlanDto(
    val id: String,
    val weekStart: String,
    val recipes: List<MealPrepRecipeDto> = emptyList(),
    val groceryList: List<GroceryItemDto> = emptyList(),
    val batchInstructions: List<String> = emptyList(),
    val estimatedPrepTime: Int = 0,
    val createdAt: String,
)
