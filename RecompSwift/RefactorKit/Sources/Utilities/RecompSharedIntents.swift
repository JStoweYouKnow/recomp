import AppIntents
import Foundation
import SwiftData

// These live in RefactorKit rather than the app target so the widget extension's
// Control Center tiles can reference the same intent types the app and Siri use.
// `RecompShortcuts` (the AppShortcutsProvider) stays in the app target, which is
// where AppIntents expects to find it.

// MARK: - Calories remaining (read-only, no app launch)

public struct CaloriesRemainingIntent: AppIntent {
    public static var title: LocalizedStringResource = "Calories Remaining"
    public static var description = IntentDescription("Check how many calories you have left today.")
    public static var openAppWhenRun = false

    public init() {}

    public func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let snap = WatchDashboardSnapshotStore.load() else {
            return .result(dialog: "Open Recomp once to sync today's numbers.")
        }
        let target = snap.caloriesTarget + snap.activityCalorieAdjustment
        let remaining = max(target - snap.caloriesConsumed, 0)
        if snap.caloriesConsumed > target {
            return .result(dialog: "You're \(snap.caloriesConsumed - target) calories over your budget today.")
        }
        return .result(dialog: "You have \(remaining) calories remaining today.")
    }
}

// MARK: - Log water (writes to the shared store, no app launch)

public struct LogWaterIntent: AppIntent {
    public static var title: LocalizedStringResource = "Log Water"
    public static var description = IntentDescription("Log water to Recomp.")
    public static var openAppWhenRun = false

    @Parameter(title: "Amount (ml)", default: 250)
    public var amountMl: Int

    public init() {}

    public init(amountMl: Int) {
        self.amountMl = amountMl
    }

    @MainActor
    public func perform() async throws -> some IntentResult & ProvidesDialog {
        let amount = max(amountMl, 1)
        do {
            let container = try RefactorSchema.makeContainer(
                appGroupIdentifier: RefactorSchema.sharedAppGroupIdentifier
            )
            let context = ModelContext(container)
            context.insert(HydrationEntry(
                date: DateHelpers.todayString(),
                time: DateHelpers.timeString(from: .now),
                amountMl: amount
            ))
            try context.save()
            PendingIntentSync.flag()
            return .result(dialog: "Logged \(amount) ml of water.")
        } catch {
            return .result(dialog: "Couldn't log water right now.")
        }
    }
}

// MARK: - Start today's workout (opens the app on the Workouts tab)

public struct StartTodaysWorkoutIntent: AppIntent {
    public static var title: LocalizedStringResource = "Start Today's Workout"
    public static var description = IntentDescription("Open Recomp to today's workout.")
    public static var openAppWhenRun = true

    public init() {}

    @MainActor
    public func perform() async throws -> some IntentResult {
        NotificationCenter.default.post(name: .recompNavigateToWorkouts, object: nil)
        return .result()
    }
}
