import UIKit
import AudioToolbox

/// Lightweight wrapper around UIKit feedback generators so imperative call sites
/// (save handlers, delete actions, sync callbacks) can fire haptics without threading
/// `.sensoryFeedback` trigger state through every view. All calls hop to the main
/// actor since the generators must be used from the main thread.
enum Haptics {
    static func success() { notify(.success) }
    static func warning() { notify(.warning) }
    static func error()   { notify(.error) }

    /// A physical "tap" — used for discrete actions like deleting a row.
    static func impact(_ style: UIImpactFeedbackGenerator.FeedbackStyle = .light) {
        Task { @MainActor in
            let generator = UIImpactFeedbackGenerator(style: style)
            generator.prepare()
            generator.impactOccurred()
        }
    }

    /// A short chime plus a success haptic — used when the rest timer completes.
    /// The chime is a system sound (silenced by the ring switch), so the haptic
    /// guarantees noticeable feedback even when the phone is muted.
    static func chime() {
        AudioServicesPlaySystemSound(1005) // short "ding"
        success()
    }

    /// A light "tick" — used when a selection changes.
    static func selection() {
        Task { @MainActor in
            let generator = UISelectionFeedbackGenerator()
            generator.prepare()
            generator.selectionChanged()
        }
    }

    private static func notify(_ type: UINotificationFeedbackGenerator.FeedbackType) {
        Task { @MainActor in
            let generator = UINotificationFeedbackGenerator()
            generator.prepare()
            generator.notificationOccurred(type)
        }
    }
}
