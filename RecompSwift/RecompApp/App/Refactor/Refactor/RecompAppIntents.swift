import AppIntents
import RefactorKit

// The intent types themselves live in RefactorKit (`RecompSharedIntents.swift`) so the
// widget extension's Control Center tiles can use them too. Only the shortcuts
// provider belongs here — AppIntents requires it in the app target.

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
