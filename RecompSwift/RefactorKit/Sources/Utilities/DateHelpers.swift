import Foundation

public enum DateHelpers {
    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()

    private static let timeFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "HH:mm"
        return f
    }()

    private static let iso8601: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    public static func todayString() -> String {
        dateFormatter.string(from: .now)
    }

    public static func dateString(from date: Date) -> String {
        dateFormatter.string(from: date)
    }

    public static func timeString(from date: Date) -> String {
        timeFormatter.string(from: date)
    }

    public static func date(from string: String) -> Date? {
        dateFormatter.date(from: string)
    }

    public static func isoString(from date: Date) -> String {
        iso8601.string(from: date)
    }

    public static func weekDates(around date: Date = .now) -> [Date] {
        let calendar = Calendar.current
        let weekday = calendar.component(.weekday, from: date)
        let startOfWeek = calendar.date(byAdding: .day, value: -(weekday - 1), to: date)!
        return (0..<7).compactMap { calendar.date(byAdding: .day, value: $0, to: startOfWeek) }
    }

    public static func dayOfWeekShort(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEE"
        return formatter.string(from: date)
    }

    public static func dayNumber(_ date: Date) -> Int {
        Calendar.current.component(.day, from: date)
    }

    public static func isToday(_ dateString: String) -> Bool {
        dateString == todayString()
    }

    /// Monday `yyyy-MM-dd` for the week containing `yyyyMmDd` (matches web `getWeekStart`).
    public static func mondayWeekStartString(containingCalendarDay yyyyMmDd: String) -> String {
        guard let d = date(from: yyyyMmDd) else { return yyyyMmDd }
        let cal = Calendar.current
        let start = cal.startOfDay(for: d)
        let noon = cal.date(bySettingHour: 12, minute: 0, second: 0, of: start) ?? start
        let wd = cal.component(.weekday, from: noon)
        let daysFromMonday = wd == 1 ? -6 : -(wd - 2)
        let monday = cal.date(byAdding: .day, value: daysFromMonday, to: start) ?? start
        return dateString(from: monday)
    }

    /// Whole weeks between two Monday week-start strings (`anchor` ≤ `other` → 0 for same week).
    public static func mondayWeeksElapsed(from anchorMonday: String, to otherMonday: String) -> Int {
        guard let a = date(from: anchorMonday), let b = date(from: otherMonday) else { return 0 }
        let days = Calendar.current.dateComponents([.day], from: a, to: b).day ?? 0
        return days / 7
    }

    public static func offsetDate(_ yyyyMmDd: String, by dayDelta: Int) -> String? {
        guard let d = date(from: yyyyMmDd) else { return nil }
        guard let shifted = Calendar.current.date(byAdding: .day, value: dayDelta, to: d) else { return nil }
        return dateString(from: shifted)
    }

    public static func weekStartMonday(containing yyyyMmDd: String) -> String {
        mondayWeekStartString(containingCalendarDay: yyyyMmDd)
    }

    public static func streakLength(dates: [String]) -> Int {
        let sorted = dates.sorted().reversed()
        var streak = 0
        var expected = todayString()

        for dateStr in sorted {
            if dateStr == expected {
                streak += 1
                if let date = date(from: expected) {
                    let prev = Calendar.current.date(byAdding: .day, value: -1, to: date)!
                    expected = dateString(from: prev)
                }
            } else {
                break
            }
        }
        return streak
    }
}
