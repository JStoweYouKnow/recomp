import Foundation

public extension Notification.Name {
    /// Posted when workout set / web progress changes. Handlers should use `SyncEngine.scheduleFetchAndApply()`
    /// (pull GET `/api/data/sync` then push) so web-edited plan/macros are not overwritten by a stale local plan on POST.
    static let recompScheduleDataSync = Notification.Name("recompScheduleDataSync")
    /// Posted on watchOS when WCSession delivers the userId from the paired iPhone,
    /// signalling that a full server pull should be attempted.
    static let recompWatchDidReceiveUserId = Notification.Name("recompWatchDidReceiveUserId")
    /// Posted by `APIClient` when any request returns HTTP 401, signalling that the
    /// stored session/token is no longer valid. `AuthService` observes this to clear
    /// credentials and route back to sign-in (without wiping local data).
    static let recompSessionExpired = Notification.Name("recompSessionExpired")
    /// Posted by notification action handlers to deep-link into specific tabs.
    static let recompNavigateToMeals = Notification.Name("recompNavigateToMeals")
    static let recompNavigateToWorkouts = Notification.Name("recompNavigateToWorkouts")
    static let recompNavigateToDashboard = Notification.Name("recompNavigateToDashboard")
}
