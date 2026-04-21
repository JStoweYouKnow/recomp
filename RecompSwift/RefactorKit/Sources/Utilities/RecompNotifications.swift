import Foundation

public extension Notification.Name {
    /// Posted when workout set / web progress changes so the app can debounce-upload via `SyncEngine`.
    static let recompScheduleDataSync = Notification.Name("recompScheduleDataSync")
    /// Posted on watchOS when WCSession delivers the userId from the paired iPhone,
    /// signalling that a full server pull should be attempted.
    static let recompWatchDidReceiveUserId = Notification.Name("recompWatchDidReceiveUserId")
}
