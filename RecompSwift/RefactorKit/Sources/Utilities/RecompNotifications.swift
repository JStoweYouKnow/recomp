import Foundation
import SwiftData

public extension Notification.Name {
    /// Posted when workout set / web progress changes. Handlers should use `SyncEngine.scheduleFetchAndApply()`
    /// (pull GET `/api/data/sync` then push) so web-edited plan/macros are not overwritten by a stale local plan on POST.
    static let recompScheduleDataSync = Notification.Name("recompScheduleDataSync")
    /// Posted on watchOS when WCSession delivers the userId from the paired iPhone,
    /// signalling that a full server pull should be attempted.
    static let recompWatchDidReceiveUserId = Notification.Name("recompWatchDidReceiveUserId")
    /// Posted on iOS after a successful background sync so the paired watch can be nudged to refresh.
    static let recompPhoneDidSync = Notification.Name("recompPhoneDidSync")
    /// Posted on watchOS when the phone pushes new session/sync context via WCSession.
    static let recompWatchShouldRefresh = Notification.Name("recompWatchShouldRefresh")
    /// Posted when `WatchDashboardSnapshotStore` writes a new dashboard snapshot (App Group).
    static let recompWatchDashboardSnapshotUpdated = Notification.Name("recompWatchDashboardSnapshotUpdated")
    /// Posted by `APIClient` when any request returns HTTP 401, signalling that the
    /// stored session/token is no longer valid. `AuthService` observes this to clear
    /// credentials and route back to sign-in (without wiping local data).
    static let recompSessionExpired = Notification.Name("recompSessionExpired")
    /// Posted by notification action handlers to deep-link into specific tabs.
    static let recompNavigateToMeals = Notification.Name("recompNavigateToMeals")
    static let recompNavigateToWorkouts = Notification.Name("recompNavigateToWorkouts")
    static let recompNavigateToDashboard = Notification.Name("recompNavigateToDashboard")
    /// Posted when a recipe URL should be saved (Share sheet / deep link).
    static let recompSaveRecipeURL = Notification.Name("recompSaveRecipeURL")
    /// Posted when user taps "Skip Today" on a workout reminder notification.
    static let recompSkipTodayWorkout = Notification.Name("recompSkipTodayWorkout")
}
