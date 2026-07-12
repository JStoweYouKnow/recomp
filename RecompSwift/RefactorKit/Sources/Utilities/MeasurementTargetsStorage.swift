import Foundation

/// Persists body measurement goals in app group defaults — same key and JSON shape as web `localStorage` / sync `meta.measurementTargets`.
public enum MeasurementTargetsStorage {
    public static func load() -> MeasurementTargets? {
        guard let data = RecompAppGroupDefaults.shared.data(forKey: RecompUserDefaultsKeys.measurementTargetsJSON) else { return nil }
        if data.isEmpty { return nil }
        return (try? JSONDecoder().decode(MeasurementTargets.self, from: data)) ?? MeasurementTargets()
    }

    public static func save(_ value: MeasurementTargets) {
        do {
            let data = try JSONEncoder().encode(value)
            RecompAppGroupDefaults.shared.set(data, forKey: RecompUserDefaultsKeys.measurementTargetsJSON)
        } catch {
            // Encoding should never fail for this type; if it does, persist minimal JSON so sync can still run.
            let fallback = Data("{}".utf8)
            RecompAppGroupDefaults.shared.set(fallback, forKey: RecompUserDefaultsKeys.measurementTargetsJSON)
        }
    }
}
