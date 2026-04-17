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

    /// Pulls the full snapshot from the server and upserts it into the local SwiftData store.
    ///
    /// Flushes any pending local changes first so `replaceWebProgressFromServer` doesn't
    /// wipe locally-completed workouts that haven't reached the server yet — this happens
    /// when the app re-foregrounds during the 800ms debounce window after a set is marked done.
    public func fetchAndApply() async throws {
        await performSync()
        try await syncService.fetchAndApply()
    }

    /// Call after local SwiftData mutations (meals, plan, milestones) so they upload to the server.
    public func markDirty() async {
        await syncService.markDirty()
    }

    private func performSync() async {
        await syncService.syncNow()
    }
}
