import SwiftUI
import SwiftData
import RefactorKit
import WatchConnectivity

@main
struct RefactorWatchApp: App {
    private let modelContainer: ModelContainer
    private let syncEngine: SyncEngine

    init() {
        WatchSessionManager.shared.activate()
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
        .onReceive(NotificationCenter.default.publisher(for: .recompScheduleDataSync)) { _ in
            guard let engine = syncEngine else { return }
            Task { await engine.scheduleFetchAndApply() }
        }
        .onReceive(NotificationCenter.default.publisher(for: .recompWatchDidReceiveUserId)) { _ in
            Task { await refreshFromServerIfSignedIn() }
        }
    }

    /// Keeps SwiftData + shared defaults aligned with the phone after edits on either device.
    private func refreshFromServerIfSignedIn() async {
        guard let engine = syncEngine else { return }
        // Prefer keychain; fall back to the userId pushed from iPhone via WCSession.
        let uid = (try? KeychainService.loadUserId())
            ?? RecompAppGroupDefaults.shared.string(forKey: RecompUserDefaultsKeys.userId)
        guard let uid, !uid.isEmpty else { return }
        try? await engine.fetchAndApply()
    }
}
