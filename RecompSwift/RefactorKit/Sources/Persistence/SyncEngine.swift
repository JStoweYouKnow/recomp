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
    public func fetchAndApply() async throws {
        try await syncService.fetchAndApply()
    }

    private func performSync() async {
        await syncService.syncNow()
    }
}
