package dev.refactor.kit.models

import kotlinx.serialization.Serializable

@Serializable
enum class AdvancementMode {
    calendar,
    completion,
}

@Serializable
enum class MissedSessionStatus {
    missed,
    skipped,
    rescheduled,
}

@Serializable
enum class ScheduleAction {
    stay_on_week,
    skip_week,
    catch_up,
    repeat_week,
    skip_today,
    reschedule,
}

@Serializable
data class MissedSession(
    val id: String,
    val planIndex: Int,
    val scheduledDate: String,
    val status: MissedSessionStatus,
    val rescheduledTo: String? = null,
    val dayLabel: String? = null,
    val focus: String? = null,
)

@Serializable
data class WorkoutExercise(
    val name: String,
    val sets: String,
    val reps: String,
    val notes: String? = null,
)

@Serializable
data class WorkoutDay(
    val day: String,
    val focus: String,
    val warmups: List<WorkoutExercise>? = null,
    val exercises: List<WorkoutExercise>,
    val finishers: List<WorkoutExercise>? = null,
)

@Serializable
data class WorkoutPlan(
    val weeklyPlan: List<WorkoutDay>,
    val tips: List<String> = emptyList(),
    val programWeek1Start: String? = null,
    val advancementMode: AdvancementMode? = null,
    val programWeekOffset: Int? = null,
    val pausedUntil: String? = null,
    val missedSessions: List<MissedSession>? = null,
    val catchUpBannerDismissedAt: String? = null,
)

@Serializable
data class FitnessPlan(
    val id: String,
    val userId: String,
    val createdAt: String,
    val workoutPlan: WorkoutPlan,
)

@Serializable
data class ScheduleAdjustResponse(
    val action: ScheduleAction,
    val summary: String,
    val workoutPlan: WorkoutPlan,
    val addedMissed: List<MissedSession>? = null,
    val missedCount: Int? = null,
)
