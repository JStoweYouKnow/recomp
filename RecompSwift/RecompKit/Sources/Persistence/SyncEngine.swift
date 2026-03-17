import Foundation
import SwiftData

actor SyncEngine {
    private let syncService: SyncService
    private var debounceTask: Task<Void, Never>?
    private let debounceInterval: Duration = .milliseconds(800)

    init(syncService: SyncService = SyncService()) {
        self.syncService = syncService
    }

    func scheduleSync() {
        debounceTask?.cancel()
        debounceTask = Task {
            try? await Task.sleep(for: debounceInterval)
            guard !Task.isCancelled else { return }
            await performSync()
        }
    }

    func syncNow() async {
        debounceTask?.cancel()
        await performSync()
    }

    private func performSync() async {
        await syncService.syncNow()
    }

    func fetchLatest() async throws -> Data {
        try await syncService.fetchFromServer()
    }
}
