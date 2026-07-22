import Foundation
import SwiftData

public enum RefactorSchema {
    /// App Group used by the iOS app, watch app, and extensions for a shared SwiftData store.
    /// Must match **App Groups** entitlements on every target that calls `makeContainer(appGroupIdentifier:)`.
    public static let sharedAppGroupIdentifier = "group.com.refactor.ios"

    public static var models: [any PersistentModel.Type] {
        [
            UserProfile.self,
            MealEntry.self,
            FitnessPlan.self,
            Milestone.self,
            WearableConnection.self,
            WearableDaySummary.self,
            Group.self,
            GroupMembership.self,
            GroupMessage.self,
            Challenge.self,
            HydrationEntry.self,
            FastingSession.self,
            BiofeedbackEntry.self,
            MetabolicModel.self,
            Supplement.self,
            BloodWork.self,
            BodyScan.self,
            CoachMessage.self,
            ActivityLogEntry.self,
            SocialSettings.self,
            PantryItem.self,
            MealPrepPlan.self,
        ]
    }

    /// Directory that holds `Refactor-v2.store` (App Group when configured, else app sandbox).
    private static func storeDirectoryURL(appGroupIdentifier: String?) -> URL? {
        if let groupId = appGroupIdentifier,
           let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: groupId) {
            return containerURL.appendingPathComponent("Library/Application Support", isDirectory: true)
        }
        return FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
    }

    /// Core Data fails to create the SQLite file when `Library/Application Support` is missing
    /// (common on first launch with an App Group). Create it before opening the store.
    private static func ensureStoreDirectory(appGroupIdentifier: String?) throws {
        guard let dir = storeDirectoryURL(appGroupIdentifier: appGroupIdentifier) else {
            throw NSError(
                domain: "RefactorSchema",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Could not resolve Application Support directory"]
            )
        }
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    }

    /// Creates the SwiftData stack without requiring `@MainActor` (e.g. widget extensions).
    /// Pass `appGroupIdentifier: RefactorSchema.sharedAppGroupIdentifier` when the target has matching App Groups.
    public static func makeContainerNonisolated(
        inMemory: Bool = false,
        appGroupIdentifier: String? = nil
    ) throws -> ModelContainer {
        if !inMemory {
            try ensureStoreDirectory(appGroupIdentifier: appGroupIdentifier)
        }
        let schema = Schema(models)
        let config: ModelConfiguration
        if let groupId = appGroupIdentifier {
            config = ModelConfiguration(
                "Refactor-v2",
                schema: schema,
                isStoredInMemoryOnly: inMemory,
                allowsSave: true,
                groupContainer: .identifier(groupId)
            )
        } else {
            config = ModelConfiguration(
                "Refactor-v2",
                schema: schema,
                isStoredInMemoryOnly: inMemory,
                allowsSave: true
            )
        }
        return try ModelContainer(
            for: schema,
            migrationPlan: RefactorMigrationPlan.self,
            configurations: [config]
        )
    }

    /// Creates the SwiftData stack on the main actor (iOS / watch app entry points).
    @MainActor
    public static func makeContainer(
        inMemory: Bool = false,
        appGroupIdentifier: String? = nil
    ) throws -> ModelContainer {
        try makeContainerNonisolated(inMemory: inMemory, appGroupIdentifier: appGroupIdentifier)
    }

    /// Deletes the on-disk store files so a corrupt or unmigrateable store can be
    /// replaced with a fresh empty database on the next `makeContainer` call.
    /// Safe to call on a sync-first app — all data re-syncs from the server.
    public static func deleteStore(appGroupIdentifier: String? = nil) {
        guard let dir = storeDirectoryURL(appGroupIdentifier: appGroupIdentifier) else { return }
        for ext in [".store", ".store-shm", ".store-wal"] {
            try? FileManager.default.removeItem(at: dir.appendingPathComponent("Refactor-v2\(ext)"))
        }
    }
}
