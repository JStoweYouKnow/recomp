import Foundation
import SwiftData

/// Everything the home-screen and lock-screen widgets render, flattened into one
/// App Group value.
///
/// Widgets get a few milliseconds and no network. Opening the SwiftData store and
/// re-deriving plan targets inside a timeline provider is both slow and fragile
/// (the store can be mid-migration), so the app publishes this snapshot on every
/// sync and the widget only ever decodes it.
public struct TodayWidgetSnapshot: Codable, Equatable, Sendable {
    public let date: String
    public let syncAt: TimeInterval

    public let caloriesConsumed: Int
    /// Budget after activity adjustments — the number the dashboard shows.
    public let caloriesTarget: Int
    public let proteinConsumed: Double
    public let proteinTarget: Double
    public let carbsConsumed: Double
    public let carbsTarget: Double
    public let fatConsumed: Double
    public let fatTarget: Double

    /// Nil on a rest day or before a plan exists.
    public let workoutDayLabel: String?
    public let workoutFocus: String?
    public let workoutExerciseCount: Int
    public let workoutCompletedCount: Int

    /// Consecutive days (through today) with at least one logged meal.
    public let loggingStreak: Int

    public init(
        date: String,
        syncAt: TimeInterval,
        caloriesConsumed: Int,
        caloriesTarget: Int,
        proteinConsumed: Double,
        proteinTarget: Double,
        carbsConsumed: Double,
        carbsTarget: Double,
        fatConsumed: Double,
        fatTarget: Double,
        workoutDayLabel: String? = nil,
        workoutFocus: String? = nil,
        workoutExerciseCount: Int = 0,
        workoutCompletedCount: Int = 0,
        loggingStreak: Int = 0
    ) {
        self.date = date
        self.syncAt = syncAt
        self.caloriesConsumed = caloriesConsumed
        self.caloriesTarget = caloriesTarget
        self.proteinConsumed = proteinConsumed
        self.proteinTarget = proteinTarget
        self.carbsConsumed = carbsConsumed
        self.carbsTarget = carbsTarget
        self.fatConsumed = fatConsumed
        self.fatTarget = fatTarget
        self.workoutDayLabel = workoutDayLabel
        self.workoutFocus = workoutFocus
        self.workoutExerciseCount = workoutExerciseCount
        self.workoutCompletedCount = workoutCompletedCount
        self.loggingStreak = loggingStreak
    }

    // MARK: - Derived

    public var caloriesRemaining: Int { max(caloriesTarget - caloriesConsumed, 0) }
    public var isOverBudget: Bool { caloriesConsumed > caloriesTarget }
    public var caloriesOver: Int { max(caloriesConsumed - caloriesTarget, 0) }

    /// 0…1, clamped — safe to hand straight to a `Gauge` or trim.
    public var calorieProgress: Double {
        guard caloriesTarget > 0 else { return 0 }
        return min(Double(caloriesConsumed) / Double(caloriesTarget), 1)
    }

    public var hasWorkout: Bool { (workoutDayLabel?.isEmpty == false) && workoutExerciseCount > 0 }
    public var workoutComplete: Bool { hasWorkout && workoutCompletedCount >= workoutExerciseCount }

    public func progress(consumed: Double, target: Double) -> Double {
        guard target > 0 else { return 0 }
        return min(consumed / target, 1)
    }

    /// Shown in the widget before the app has ever synced.
    public static var placeholder: TodayWidgetSnapshot {
        TodayWidgetSnapshot(
            date: DateHelpers.todayString(),
            syncAt: Date().timeIntervalSince1970,
            caloriesConsumed: 1_240,
            caloriesTarget: 2_180,
            proteinConsumed: 96,
            proteinTarget: 165,
            carbsConsumed: 118,
            carbsTarget: 210,
            fatConsumed: 44,
            fatTarget: 72,
            workoutDayLabel: "Push Day",
            workoutFocus: "Chest, shoulders & triceps",
            workoutExerciseCount: 6,
            workoutCompletedCount: 2,
            loggingStreak: 5
        )
    }
}

public enum TodayWidgetSnapshotStore {
    public static let defaultsKey = "recomp_today_widget_snapshot_v1"

    public static func save(_ snapshot: TodayWidgetSnapshot) {
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        RecompAppGroupDefaults.shared.set(data, forKey: defaultsKey)
    }

    /// Returns nil when nothing is stored or the stored snapshot is from an earlier
    /// day — a stale calorie count is worse than an honest "open the app" prompt.
    public static func load(for date: String = DateHelpers.todayString()) -> TodayWidgetSnapshot? {
        guard let data = RecompAppGroupDefaults.shared.data(forKey: defaultsKey),
              let snapshot = try? JSONDecoder().decode(TodayWidgetSnapshot.self, from: data),
              snapshot.date == date
        else { return nil }
        return snapshot
    }
}

@MainActor
public enum TodayWidgetSnapshotPublisher {
    /// Derives the same numbers the dashboard shows and stores them for the widget.
    /// Call wherever `WatchDashboardSnapshotPublisher.publish` is called.
    public static func publish(from context: ModelContext) {
        let mealService = MealService()
        let planService = PlanService()

        let consumed = mealService.todaysMacros(context: context)
        let targets = planService.todaysTargets(context: context)
        let activityAdj = mealService.todaysActivityCalorieAdjustment(context: context)

        var dayLabel: String?
        var focus: String?
        var exerciseCount = 0
        var completedCount = 0

        if let workout = planService.todaysWorkout(context: context) {
            dayLabel = workout.day
            focus = workout.focus
            exerciseCount = workout.exerciseSlotCount
            if let plan = planService.currentPlan(context: context),
               let planIndex = planService.todaysWorkoutPlanIndex(context: context) {
                completedCount = WorkoutService.shared.completedExerciseCount(
                    for: workout,
                    dayKey: DateHelpers.todayString(),
                    planIndex: planIndex,
                    planId: plan.id
                )
            }
        }

        let mealDates = (try? context.fetch(FetchDescriptor<MealEntry>()))?.map(\.date) ?? []
        let streak = DateHelpers.streakLength(dates: Array(Set(mealDates)))

        TodayWidgetSnapshotStore.save(
            TodayWidgetSnapshot(
                date: DateHelpers.todayString(),
                syncAt: Date().timeIntervalSince1970,
                caloriesConsumed: consumed.calories,
                caloriesTarget: targets.calories + activityAdj,
                proteinConsumed: consumed.protein,
                proteinTarget: targets.protein,
                carbsConsumed: consumed.carbs,
                carbsTarget: targets.carbs,
                fatConsumed: consumed.fat,
                fatTarget: targets.fat,
                workoutDayLabel: dayLabel,
                workoutFocus: focus,
                workoutExerciseCount: exerciseCount,
                workoutCompletedCount: completedCount,
                loggingStreak: streak
            )
        )
    }
}
