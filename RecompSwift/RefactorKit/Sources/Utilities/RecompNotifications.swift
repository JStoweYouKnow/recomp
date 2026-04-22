import Foundation

public extension Notification.Name {
    /// Posted when workout set / web progress changes. Handlers should use `SyncEngine.scheduleFetchAndApply()`
    /// (pull GET `/api/data/sync` then push) so web-edited plan/macros are not overwritten by a stale local plan on POST.
    static let recompScheduleDataSync = Notification.Name("recompScheduleDataSync")
    /// Posted on watchOS when WCSession delivers the userId from the paired iPhone,
    /// signalling that a full server pull should be attempted.
    static let recompWatchDidReceiveUserId = Notification.Name("recompWatchDidReceiveUserId")
}
