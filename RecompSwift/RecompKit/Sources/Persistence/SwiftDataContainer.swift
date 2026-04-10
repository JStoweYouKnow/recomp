import Foundation
import SwiftData

public enum RecompSchema {
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

    @MainActor
    public static func makeContainer(inMemory: Bool = false) throws -> ModelContainer {
        let schema = Schema(models)
        let config = ModelConfiguration(
            "Recomp",
            schema: schema,
            isStoredInMemoryOnly: inMemory,
            allowsSave: true,
            groupContainer: .identifier("group.com.recomp.ios")
        )
        return try ModelContainer(for: schema, configurations: [config])
    }
}
