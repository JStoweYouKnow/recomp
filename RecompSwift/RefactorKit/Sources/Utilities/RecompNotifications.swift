import Foundation

public extension Notification.Name {
    /// Posted when workout set / web progress changes so the app can debounce-upload via `SyncEngine`.
    static let recompScheduleDataSync = Notification.Name("recompScheduleDataSync")
    /// Posted when user taps "Skip Today" on a workout reminder notification.
    static let recompSkipTodayWorkout = Notification.Name("recompSkipTodayWorkout")
}
