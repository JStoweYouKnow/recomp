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

    /// Creates the SwiftData stack without requiring `@MainActor` (e.g. widget extensions).
    /// Pass `appGroupIdentifier: RefactorSchema.sharedAppGroupIdentifier` when the target has matching App Groups.
    public static func makeContainerNonisolated(
        inMemory: Bool = false,
        appGroupIdentifier: String? = nil
    ) throws -> ModelContainer {
        let schema = Schema(models)
        let config: ModelConfiguration
        if let groupId = appGroupIdentifier {
            config = ModelConfiguration(
                "Refactor",
                schema: schema,
                isStoredInMemoryOnly: inMemory,
                allowsSave: true,
                groupContainer: .identifier(groupId)
            )
        } else {
            config = ModelConfiguration(
                "Refactor",
                schema: schema,
                isStoredInMemoryOnly: inMemory,
                allowsSave: true
            )
        }
        return try ModelContainer(for: schema, configurations: [config])
    }

    /// Creates the SwiftData stack on the main actor (iOS / watch app entry points).
    @MainActor
    public static func makeContainer(
        inMemory: Bool = false,
        appGroupIdentifier: String? = nil
    ) throws -> ModelContainer {
        try makeContainerNonisolated(inMemory: inMemory, appGroupIdentifier: appGroupIdentifier)
    }
}
