import UIKit
import UserNotifications
import RefactorKit

class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        registerNotificationCategories()
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        Task {
            try? await APIClient.shared.requestVoid(PushAPI.subscribeExpo(token: token))
        }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("APNs registration failed: \(error.localizedDescription)")
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .badge, .sound])
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let actionId = response.actionIdentifier
        let category = response.notification.request.content.categoryIdentifier

        switch (category, actionId) {
        case ("MEAL_REMINDER", "LOG_MEAL"):
            break
        case ("WORKOUT_REMINDER", "START_WORKOUT"):
            break
        case ("WORKOUT_REMINDER", "SKIP"):
            NotificationCenter.default.post(name: .recompSkipTodayWorkout, object: nil)
        case ("HYDRATION_REMINDER", "LOG_WATER"):
            break
        default:
            break
        }

        completionHandler()
    }

    private func registerNotificationCategories() {
        let mealActions = [
            UNNotificationAction(identifier: "LOG_MEAL", title: "Log Meal", options: .foreground),
            UNNotificationAction(identifier: "SNOOZE", title: "Snooze 30min", options: []),
        ]
        let mealCategory = UNNotificationCategory(
            identifier: "MEAL_REMINDER",
            actions: mealActions,
            intentIdentifiers: []
        )

        let workoutActions = [
            UNNotificationAction(identifier: "START_WORKOUT", title: "Start Workout", options: .foreground),
            UNNotificationAction(identifier: "SKIP", title: "Skip Today", options: .destructive),
        ]
        let workoutCategory = UNNotificationCategory(
            identifier: "WORKOUT_REMINDER",
            actions: workoutActions,
            intentIdentifiers: []
        )

        let hydrationActions = [
            UNNotificationAction(identifier: "LOG_WATER", title: "Log Water", options: []),
            UNNotificationAction(identifier: "DISMISS", title: "Dismiss", options: []),
        ]
        let hydrationCategory = UNNotificationCategory(
            identifier: "HYDRATION_REMINDER",
            actions: hydrationActions,
            intentIdentifiers: []
        )

        let coachActions = [
            UNNotificationAction(identifier: "REPLY", title: "Reply", options: .foreground),
            UNNotificationAction(identifier: "DISMISS", title: "Dismiss", options: []),
        ]
        let coachCategory = UNNotificationCategory(
            identifier: "COACH_CHECKIN",
            actions: coachActions,
            intentIdentifiers: []
        )

        UNUserNotificationCenter.current().setNotificationCategories([
            mealCategory, workoutCategory, hydrationCategory, coachCategory
        ])
    }
}
