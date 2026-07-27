import AppIntents
import SwiftData
import RefactorKit

// MARK: - Calories remaining (read-only, no app launch)

struct CaloriesRemainingIntent: AppIntent {
    static var title: LocalizedStringResource = "Calories Remaining"
    static var description = IntentDescription("Check how many calories you have left today.")
    static var openAppWhenRun = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
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

struct LogWaterIntent: AppIntent {
    static var title: LocalizedStringResource = "Log Water"
    static var description = IntentDescription("Log water to Recomp.")
    static var openAppWhenRun = false

    @Parameter(title: "Amount (ml)", default: 250)
    var amountMl: Int

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
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

struct StartTodaysWorkoutIntent: AppIntent {
    static var title: LocalizedStringResource = "Start Today's Workout"
    static var description = IntentDescription("Open Recomp to today's workout.")
    static var openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        NotificationCenter.default.post(name: .recompNavigateToWorkouts, object: nil)
        return .result()
    }
}

// MARK: - Siri / Spotlight shortcuts

struct RecompShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: CaloriesRemainingIntent(),
            phrases: [
                "How many calories do I have left in \(.applicationName)",
                "\(.applicationName) calories remaining"
            ],
            shortTitle: "Calories Remaining",
            systemImageName: "flame.fill"
        )
        AppShortcut(
            intent: LogWaterIntent(),
            phrases: [
                "Log water in \(.applicationName)",
                "Log water with \(.applicationName)"
            ],
            shortTitle: "Log Water",
            systemImageName: "drop.fill"
        )
        AppShortcut(
            intent: StartTodaysWorkoutIntent(),
            phrases: [
                "Start my workout in \(.applicationName)",
                "Start today's workout in \(.applicationName)"
            ],
            shortTitle: "Start Workout",
            systemImageName: "dumbbell.fill"
        )
    }
}
