import Foundation

public extension Notification.Name {
    /// Posted when workout set / web progress changes so the app can debounce-upload via `SyncEngine`.
    static let recompScheduleDataSync = Notification.Name("recompScheduleDataSync")
}
