import SwiftUI
import SwiftData
import RefactorKit

@main
struct RefactorWatchApp: App {
    private let modelContainer: ModelContainer
    private let syncEngine: SyncEngine

    init() {
        do {
            modelContainer = try RefactorSchema.makeContainer(
                appGroupIdentifier: RefactorSchema.sharedAppGroupIdentifier
            )
        } catch {
            print("SwiftData on-disk store failed (watch): \(error). Using in-memory container.")
            do {
                modelContainer = try RefactorSchema.makeContainer(inMemory: true)
            } catch {
                fatalError("SwiftData could not start (watch): \(error)")
            }
        }
        syncEngine = SyncEngine(modelContainer: modelContainer)
    }

    var body: some Scene {
        WindowGroup {
            WatchTabView()
                .environment(\.syncEngine, syncEngine)
        }
        .modelContainer(modelContainer)
    }
}

struct WatchTabView: View {
    @Environment(\.syncEngine) private var syncEngine
    @Environment(\.scenePhase) private var scenePhase

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
        .task { await refreshFromServerIfSignedIn() }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            Task { await refreshFromServerIfSignedIn() }
        }
    }

    /// Keeps SwiftData + shared defaults aligned with the phone after edits on either device.
    private func refreshFromServerIfSignedIn() async {
        guard let engine = syncEngine else { return }
        guard let uid = try? KeychainService.loadUserId(), !uid.isEmpty else { return }
        try? await engine.fetchAndApply()
    }
}
