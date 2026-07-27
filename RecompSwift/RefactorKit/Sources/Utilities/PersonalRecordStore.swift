import Foundation

/// Tracks each exercise's best estimated one-rep-max (Epley) so newly logged sets can be
/// recognised as personal records. Persisted in the App Group. Names are normalised so
/// "Bench Press" and "bench press " collapse to one record.
public enum PersonalRecordStore {
    private static let key = "recomp.personalRecords.v1"
    private static var defaults: UserDefaults { RecompAppGroupDefaults.shared }

    private static func load() -> [String: Double] {
        guard let data = defaults.data(forKey: key),
              let dict = try? JSONDecoder().decode([String: Double].self, from: data) else { return [:] }
        return dict
    }

    private static func persist(_ dict: [String: Double]) {
        if let data = try? JSONEncoder().encode(dict) { defaults.set(data, forKey: key) }
    }

    private static func normalize(_ name: String) -> String {
        name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    /// Epley estimate: weight × (1 + reps/30). Equals the weight at 1 rep.
    public static func estimatedOneRepMax(weightLbs: Double, reps: Int) -> Double {
        guard weightLbs > 0, reps > 0 else { return 0 }
        return weightLbs * (1.0 + Double(reps) / 30.0)
    }

    public static func best(for exerciseName: String) -> Double {
        load()[normalize(exerciseName)] ?? 0
    }

    /// Records a completed set. Returns `true` only when it beats an *established* prior best
    /// (the first-ever log for an exercise seeds the record without counting as a PR, so a new
    /// exercise doesn't immediately celebrate).
    @discardableResult
    public static func record(exerciseName: String, weightLbs: Double, reps: Int) -> Bool {
        let oneRM = estimatedOneRepMax(weightLbs: weightLbs, reps: reps)
        guard oneRM > 0 else { return false }
        var dict = load()
        let k = normalize(exerciseName)
        let prior = dict[k] ?? 0
        guard oneRM > prior + 0.5 else { return false }
        dict[k] = oneRM
        persist(dict)
        return prior > 0
    }
}
