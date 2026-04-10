import Foundation
import SwiftData

public actor SyncService {
    private let api: APIClient
    private var syncTask: Task<Void, Never>?
    private var isDirty = false

    public init(api: APIClient = .shared) {
        self.api = api
    }

    public func markDirty() {
        isDirty = true
        scheduleSync()
    }

    public func scheduleSync() {
        syncTask?.cancel()
        syncTask = Task {
            try? await Task.sleep(for: .milliseconds(800))
            guard !Task.isCancelled, isDirty else { return }
            await syncNow()
        }
    }

    public func syncNow() async {
        isDirty = false
        let payload = SyncPayload(profile: nil, meals: nil, plan: nil, milestones: nil)

        do {
            try await api.requestVoid(MiscAPI.dataSync(payload: payload))
        } catch {
            isDirty = true
        }
    }

    public func fetchFromServer() async throws -> Data {
        try await api.requestRaw(MiscAPI.dataFetch)
    }
}
