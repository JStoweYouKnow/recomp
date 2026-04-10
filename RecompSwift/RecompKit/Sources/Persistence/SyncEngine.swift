import Foundation
import SwiftData

public actor SyncEngine {
    private let syncService: SyncService
    private var debounceTask: Task<Void, Never>?
    private let debounceInterval: Duration = .milliseconds(800)

    public init(syncService: SyncService = SyncService()) {
        self.syncService = syncService
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

    private func performSync() async {
        await syncService.syncNow()
    }

    public func fetchLatest() async throws -> Data {
        try await syncService.fetchFromServer()
    }
}
