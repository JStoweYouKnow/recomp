import Foundation
import SwiftData
import WidgetKit

public actor SyncEngine {
    private let syncService: SyncService
    private var debounceTask: Task<Void, Never>?
    /// Debounced pull-then-push for workout Web progress (separate from `scheduleSync` so meal `markDirty` stays push-only).
    private var workoutPullPushDebounceTask: Task<Void, Never>?
    /// Coalesces overlapping `fetchAndApply()` calls (e.g. `.task` + `onChange` on cold start).
    private var fetchAndApplyTask: Task<Void, Error>?
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

    public func syncNow() async -> Bool {
        debounceTask?.cancel()
        return await syncService.syncNow()
    }

    /// Pulls the full snapshot from the server and upserts it into the local SwiftData store,
    /// then pushes local state so edits made on this device (and workout progress) reach the server.
    ///
    /// **Order is pull → push.** A push-first snapshot would POST stale meals from this device
    /// before the GET; the API treats the meal list as authoritative and deletes server rows
    /// missing from that payload, so web-only meals disappeared and the phone never caught up.
    ///
    /// Same intent as Expo `pullRemoteSnapshot()` + `syncToServer()` after `hydrate`: web-edited
    /// plan targets (macros, `programWeek1Start`, etc.) are merged before this device POSTs.
    ///
    /// Workout progress: `WorkoutService.replaceWebProgressFromServer` only clears day buckets
    /// for dates present in the server map, preserving in-progress days not yet on the server.
    public func fetchAndApply() async throws {
        if let inFlight = fetchAndApplyTask {
            try await inFlight.value
            return
        }
        let task = Task<Void, Error> {
            if await syncService.hasPendingChanges {
                await performSync()
            }
            try await syncService.fetchAndApply()
            await performSync()
        }
        fetchAndApplyTask = task
        defer { fetchAndApplyTask = nil }
        try await task.value
    }

    /// Debounced `fetchAndApply()` for workout completion / Web progress keys (`recompScheduleDataSync`).
    /// Uses pull-then-push so a stale local `FitnessPlan` (e.g. old macro targets) does not overwrite web edits on DynamoDB.
    public func scheduleFetchAndApply() {
        workoutPullPushDebounceTask?.cancel()
        workoutPullPushDebounceTask = Task {
            try? await Task.sleep(for: debounceInterval)
            guard !Task.isCancelled else { return }
            try? await fetchAndApply()
        }
    }

    /// Call after local SwiftData mutations (meals, plan, milestones) so they upload to the server.
    public func markDirty() async {
        await syncService.markDirty()
    }

    private func performSync() async -> Bool {
        let ok = await syncService.syncNow()
        // Refresh watch complications / home-screen widgets that read the shared
        // App Group store so they reflect freshly synced macros and streaks.
        WidgetCenter.shared.reloadAllTimelines()
        #if os(iOS)
        NotificationCenter.default.post(name: .recompPhoneDidSync, object: nil)
        #endif
        return ok
    }
}
