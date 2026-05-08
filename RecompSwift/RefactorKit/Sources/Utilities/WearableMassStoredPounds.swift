import Foundation
import SwiftData

/// Canonical units for synced wearable summaries (`WearableDaySummary`).
/// Matches `sync-schema.ts`: `weight` and `muscleMass` are **pounds**.
public enum WearableMassStoredPounds {
    /// kg = lbs × factor
    public static let lbsToKg = 0.45359237

    /// When building payloads that need SI mass (metabolic regression, HK export, etc.).
    public static func weightKg(fromStoredPounds lbs: Double?) -> Double? {
        guard let lbs, lbs > 0 else { return nil }
        return lbs * lbsToKg
    }
}

/// One-time fix for pre-fix builds that saved **kg** in `WearableDaySummary.weight` for smart-scale rows while the sync contract expects **lbs**.
public enum WearableMassStoredPoundsMigration {
    private static let migratedKey = "recomp_wearable_scale_mass_migrated_to_lbs_v1"

    /// Run once early in app lifecycle (e.g. `RootView` `.task`).
    /// Uses profile weight as a sanity check — skips if unavailable.
    @MainActor
    public static func runOnceIfNeeded(context: ModelContext, profileWeightLbs: Double?) {
        let defs = RecompAppGroupDefaults.shared
        guard !defs.bool(forKey: migratedKey) else { return }
        defs.set(true, forKey: migratedKey)

        guard let profile = profileWeightLbs, profile >= 66 else {
            return
        }

        let summaries = (try? context.fetch(FetchDescriptor<WearableDaySummary>())) ?? []
        var changed = false
        let factor = 2.2046226218

        for s in summaries where s.provider == .scale {
            if let w = s.weight {
                guard w >= 35, w <= 125 else { continue }
                let asLbsFromKg = w * factor
                let errStay = abs(w - profile) / max(profile, 1)
                let errConv = abs(asLbsFromKg - profile) / max(profile, 1)
                if errConv + 0.02 < min(errStay, 1), errConv < 0.20 {
                    s.weight = asLbsFromKg
                    if let mm = s.muscleMass, mm >= 8, mm <= 90 {
                        s.muscleMass = mm * factor
                    }
                    changed = true
                }
            }
        }
        if changed {
            try? context.save()
        }
    }
}
