import SwiftUI
import SwiftData

@main
struct RecompWatchApp: App {
    var body: some Scene {
        WindowGroup {
            WatchTabView()
        }
        .modelContainer(try! RecompSchema.makeContainer())
    }
}

struct WatchTabView: View {
    var body: some View {
        TabView {
            WatchDashboardView()
            QuickMealLogView()
            WatchWorkoutView()
            WatchHydrationView()
            WatchFastingView()
            WatchBiofeedbackView()
            WatchCoachView()
        }
        .tabViewStyle(.verticalPage)
    }
}
