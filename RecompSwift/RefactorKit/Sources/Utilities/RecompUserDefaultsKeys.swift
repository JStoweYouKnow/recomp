import Foundation

/// Centralized `UserDefaults` keys shared with sync / coach parity.
public enum RecompUserDefaultsKeys {
    public static let hasAdjustedPlan = "recomp_has_adjusted_plan"
    public static let remoteMetaXp = "recomp_sync_remote_meta_xp"
    public static let ricoHistoryJSON = "recomp_sync_rico_history_json"
    public static let measurementTargetsJSON = "recomp_sync_measurement_targets_json"
    /// Mirrors the authenticated user ID into the shared App Group suite so watchOS
    /// can identify the user without relying on cross-process keychain access.
    public static let userId = "recomp_user_id"
    /// Mirrors the API token into the shared App Group suite as a fallback for
    /// watchOS where keychain access-group writes can fail.
    public static let apiToken = "recomp_api_token"
    public static let savedRecipesJSON = "recomp_sync_saved_recipes_json"
    /// Pending recipe URL from Share / deep link (Phase 2).
    public static let pendingRecipeSaveURL = "recomp_pending_recipe_save_url"
}
