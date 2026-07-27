import Foundation
import UserNotifications

/// Schedules a one-shot local notification that fires when a rest period ends, so the
/// alert still reaches the user when the app is backgrounded or the phone is locked
/// (the in-app `RestTimerBanner` only chimes while foregrounded).
///
/// When the app *is* foregrounded at fire time, `AppDelegate` suppresses this
/// notification's banner/sound (matching on `category`) so it never double-alerts with
/// the in-app chime.
enum RestTimerNotifier {
    static let identifier = "recomp.restTimer"
    static let category = "REST_TIMER"

    /// Schedules the end-of-rest notification `seconds` from now. Replaces any in-flight
    /// timer notification. Prompts for permission once (in context) if undetermined;
    /// otherwise a no-op when notifications aren't authorized — the in-app chime still plays.
    static func schedule(after seconds: Int, exerciseName: String) {
        guard seconds > 0 else { return }
        Task {
            let center = UNUserNotificationCenter.current()
            let settings = await center.notificationSettings()
            switch settings.authorizationStatus {
            case .notDetermined:
                // Ask once, contextually — the user just started a rest timer.
                guard (try? await center.requestAuthorization(options: [.alert, .sound])) == true else { return }
            case .authorized, .provisional:
                break
            default:
                return
            }

            let content = UNMutableNotificationContent()
            content.title = "Rest complete"
            content.body = exerciseName.isEmpty
                ? "Time for your next set."
                : "Time for your next set of \(exerciseName)."
            content.sound = .default
            content.categoryIdentifier = category

            cancel()
            let request = UNNotificationRequest(
                identifier: identifier,
                content: content,
                trigger: UNTimeIntervalNotificationTrigger(timeInterval: TimeInterval(seconds), repeats: false)
            )
            try? await center.add(request)
        }
    }

    /// Removes the pending (and any already-delivered) rest-timer notification.
    static func cancel() {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [identifier])
        center.removeDeliveredNotifications(withIdentifiers: [identifier])
    }
}
