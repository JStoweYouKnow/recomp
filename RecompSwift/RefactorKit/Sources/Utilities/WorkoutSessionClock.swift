import Foundation

/// Records when a workout day's first set was completed so a completed session has a real
/// elapsed duration (used by the post-workout summary and the Apple Health export). Stored
/// in the App Group so it survives relaunch. Keyed by the day's progress key.
public enum WorkoutSessionClock {
    private static func key(_ dayKey: String) -> String { "recomp.workoutSessionStart.\(dayKey)" }

    /// Stamps the start time the first time a set is completed for `dayKey`; later calls are no-ops.
    public static func markStartedIfNeeded(dayKey: String) {
        let defaults = RecompAppGroupDefaults.shared
        let k = key(dayKey)
        guard defaults.object(forKey: k) == nil else { return }
        defaults.set(Date.now.timeIntervalSince1970, forKey: k)
    }

    public static func startDate(dayKey: String) -> Date? {
        let t = RecompAppGroupDefaults.shared.double(forKey: key(dayKey))
        return t > 0 ? Date(timeIntervalSince1970: t) : nil
    }

    public static func clear(dayKey: String) {
        RecompAppGroupDefaults.shared.removeObject(forKey: key(dayKey))
    }
}
