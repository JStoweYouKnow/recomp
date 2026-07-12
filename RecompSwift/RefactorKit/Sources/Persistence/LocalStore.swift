import Foundation
import SwiftData

/// Local data lifecycle helpers. Used on explicit logout / account deletion so a
/// shared device never leaks one account's data to the next sign-in.
public enum LocalStore {

    /// Deletes every persisted model row from the given context and saves.
    /// Keep this list in sync with `RefactorSchema.models`.
    public static func wipeAll(_ context: ModelContext) {
        try? context.delete(model: UserProfile.self)
        try? context.delete(model: MealEntry.self)
        try? context.delete(model: FitnessPlan.self)
        try? context.delete(model: Milestone.self)
        try? context.delete(model: WearableConnection.self)
        try? context.delete(model: WearableDaySummary.self)
        try? context.delete(model: Group.self)
        try? context.delete(model: GroupMembership.self)
        try? context.delete(model: GroupMessage.self)
        try? context.delete(model: Challenge.self)
        try? context.delete(model: HydrationEntry.self)
        try? context.delete(model: FastingSession.self)
        try? context.delete(model: BiofeedbackEntry.self)
        try? context.delete(model: MetabolicModel.self)
        try? context.delete(model: Supplement.self)
        try? context.delete(model: BloodWork.self)
        try? context.delete(model: BodyScan.self)
        try? context.delete(model: CoachMessage.self)
        try? context.delete(model: ActivityLogEntry.self)
        try? context.delete(model: SocialSettings.self)
        try? context.delete(model: PantryItem.self)
        try? context.delete(model: MealPrepPlan.self)
        try? context.save()
    }

    /// Clears cached App Group values that are scoped to the signed-in user.
    /// (User ID and API token are cleared separately by `KeychainService.delete()`.)
    public static func clearCachedDefaults() {
        let defaults = RecompAppGroupDefaults.shared
        for key in [
            RecompUserDefaultsKeys.hasAdjustedPlan,
            RecompUserDefaultsKeys.remoteMetaXp,
            RecompUserDefaultsKeys.ricoHistoryJSON,
            RecompUserDefaultsKeys.measurementTargetsJSON,
            RecompUserDefaultsKeys.savedRecipesJSON,
            RecompUserDefaultsKeys.pendingRecipeSaveURL,
        ] {
            defaults.removeObject(forKey: key)
        }
    }
}
