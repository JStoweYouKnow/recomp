import Foundation

/// UserDefaults backed by the same App Group as SwiftData so iOS, watchOS, and extensions
/// read/write sync metadata, workout progress, and related keys consistently.
public enum RecompAppGroupDefaults {
    /// Keys we may have written to `UserDefaults.standard` before App Group defaults existed.
    private static let legacyKeysToMigrate: [String] = [
        RecompUserDefaultsKeys.hasAdjustedPlan,
        RecompUserDefaultsKeys.remoteMetaXp,
        RecompUserDefaultsKeys.ricoHistoryJSON,
        RecompUserDefaultsKeys.measurementTargetsJSON,
        RecompUserDefaultsKeys.userId,
        RecompUserDefaultsKeys.savedRecipesJSON,
        "recomp_workout_set_progress_v2",
        "recomp_workout_set_progress_v1",
        "recomp_metabolic_model_cache_v1",
    ]

    public static var shared: UserDefaults {
        guard let suite = UserDefaults(suiteName: RefactorSchema.sharedAppGroupIdentifier) else {
            return .standard
        }
        migrateLegacyValuesIfNeeded(into: suite)
        return suite
    }

    /// Copies values from the host-only defaults into the suite when the suite has no entry yet.
    private static func migrateLegacyValuesIfNeeded(into suite: UserDefaults) {
        let standard = UserDefaults.standard
        for key in legacyKeysToMigrate {
            guard suite.object(forKey: key) == nil, let value = standard.object(forKey: key) else { continue }
            suite.set(value, forKey: key)
        }
    }
}
