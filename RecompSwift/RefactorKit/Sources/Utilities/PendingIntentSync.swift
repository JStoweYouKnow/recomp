import Foundation

/// Bridges writes made by App Intents (which run outside the app's live sync state) to the
/// app's sync engine. An intent that mutates the shared store sets this flag; the app
/// consumes it on next activation and performs a push so the change reaches the server.
public enum PendingIntentSync {
    private static let key = "recomp.pendingIntentPush"

    public static func flag() {
        RecompAppGroupDefaults.shared.set(true, forKey: key)
    }

    /// Returns true once if a flag was set, clearing it.
    public static func consume() -> Bool {
        let defaults = RecompAppGroupDefaults.shared
        let value = defaults.bool(forKey: key)
        if value { defaults.removeObject(forKey: key) }
        return value
    }
}
