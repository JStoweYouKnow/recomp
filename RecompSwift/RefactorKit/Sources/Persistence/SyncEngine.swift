import Foundation
import SwiftData

public actor SyncEngine {
    private let syncService: SyncService
    private var debounceTask: Task<Void, Never>?
    private let debounceInterval: Duration = .milliseconds(800)

    public init(api: APIClient = .shared, modelContainer: ModelContainer) {
        self.syncService = SyncService(api: api, modelContainer: modelContainer)
    }

    public func scheduleSync() {
        debounceTask?.cancel()
        debounceTask = Task {
            try? await Task.sleep(for: debounceInterval)
            guard !Task.isCancelled else { return }
            await performSync()
        }
    }

    public func syncNow() async {
        debounceTask?.cancel()
        await performSync()
    }

    /// Pulls the full snapshot from the server and upserts it into the local SwiftData store,
    /// then pushes local state so edits made on this device (and workout progress) reach the server.
    ///
    /// **Order is pull → push.** A push-first snapshot would POST stale meals from this device
    /// before the GET; the API treats the meal list as authoritative and deletes server rows
    /// missing from that payload, so web-only meals disappeared and the phone never caught up.
    ///
    /// Workout progress: `WorkoutService.replaceWebProgressFromServer` only clears day buckets
    /// for dates present in the server map, preserving in-progress days not yet on the server.
    public func fetchAndApply() async throws {
        try await syncService.fetchAndApply()
        await performSync()
    }

    /// Call after local SwiftData mutations (meals, plan, milestones) so they upload to the server.
    public func markDirty() async {
        await syncService.markDirty()
    }

    private func performSync() async {
        await syncService.syncNow()
    }
}
