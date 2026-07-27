import SwiftUI
import SwiftData
import RefactorKit
import WatchConnectivity
import WidgetKit
import OSLog

@main
struct RefactorWatchApp: App {
    private let modelContainer: ModelContainer
    private let syncEngine: SyncEngine

    init() {
        WatchSessionManager.shared.activate()
        let logger = Logger(subsystem: "com.refactor.ios", category: "SwiftData")
        do {
            modelContainer = try RefactorSchema.makeContainer(
                appGroupIdentifier: RefactorSchema.sharedAppGroupIdentifier
            )
        } catch {
            // Never delete the shared App Group store from watch — the phone app may hold it open.
            logger.error("On-disk SwiftData store failed to open (watch): \(error, privacy: .public). Using a temporary in-memory store.")
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
        .onReceive(NotificationCenter.default.publisher(for: .recompWatchShouldRefresh)) { _ in
            Task { await refreshFromServerIfSignedIn() }
        }
        .onReceive(NotificationCenter.default.publisher(for: .recompWatchDashboardSnapshotUpdated)) { _ in
            WidgetCenter.shared.reloadAllTimelines()
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
