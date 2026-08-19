import Foundation

/// Memoises the derived training analytics that SwiftUI views read during `body`.
///
/// `Progression.buildAllProgressions` rescans the whole set-log array once per distinct
/// exercise, and `MuscleVolume.computeWeekly` walks it again. Both were being called from
/// computed properties on `View` structs, so they re-ran on every body evaluation — several
/// times per frame across the Dashboard and Workouts screens.
///
/// The results depend only on the stored set logs, so they are cached against
/// `WorkoutSetLogStorage.generation` and recomputed exactly when the logs actually change.
/// MainActor-isolated so the cache needs no locking; every caller is a view.
@MainActor
public enum WorkoutAnalyticsCache {
    private static var progressionsGeneration = -1
    private static var progressionsValue: [Progression.ExerciseProgression] = []

    private static var volumeGeneration = -1
    private static var volumeByWeekStart: [String: MuscleVolume.Summary] = [:]

    private static var prescriptionGeneration = -1
    private static var prescriptionsByKey: [String: [String: Progression.SetPrescription]] = [:]

    /// Per-exercise progression history. Cached until the set logs change.
    public static func progressions() -> [Progression.ExerciseProgression] {
        let generation = WorkoutSetLogStorage.generation
        if generation != progressionsGeneration {
            progressionsValue = Progression.buildAllProgressions(logs: WorkoutSetLogStorage.load())
            progressionsGeneration = generation
        }
        return progressionsValue
    }

    /// Hard sets per muscle for a Monday-start week. Cached per week start.
    public static func weeklyVolume(weekStart: String) -> MuscleVolume.Summary {
        let generation = WorkoutSetLogStorage.generation
        if generation != volumeGeneration {
            volumeByWeekStart.removeAll(keepingCapacity: true)
            volumeGeneration = generation
        }
        if let cached = volumeByWeekStart[weekStart] { return cached }
        let summary = MuscleVolume.computeWeekly(
            setLogs: WorkoutSetLogStorage.load(),
            weekStart: weekStart
        )
        volumeByWeekStart[weekStart] = summary
        return summary
    }

    /// Prescribed load per exercise for one workout day.
    ///
    /// `cacheKey` must capture everything the prescription depends on besides the logs —
    /// the day being shown plus the readiness and mesocycle multipliers, since those scale
    /// the result.
    public static func prescriptions(
        cacheKey: String,
        exercises: [WorkoutExercise],
        options: Progression.Options
    ) -> [String: Progression.SetPrescription] {
        let generation = WorkoutSetLogStorage.generation
        if generation != prescriptionGeneration {
            prescriptionsByKey.removeAll(keepingCapacity: true)
            prescriptionGeneration = generation
        }
        if let cached = prescriptionsByKey[cacheKey] { return cached }
        let logs = WorkoutSetLogStorage.load()
        let value = logs.isEmpty
            ? [:]
            : Progression.prescribeWorkoutDay(exercises: exercises, logs: logs, options: options)
        prescriptionsByKey[cacheKey] = value
        return value
    }

    /// Drops every cached value. Call on sign-out.
    public static func reset() {
        progressionsGeneration = -1
        progressionsValue = []
        volumeGeneration = -1
        volumeByWeekStart.removeAll()
        prescriptionGeneration = -1
        prescriptionsByKey.removeAll()
    }
}
