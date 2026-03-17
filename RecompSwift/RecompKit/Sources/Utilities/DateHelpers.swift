import Foundation

enum DateHelpers {
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

    static func todayString() -> String {
        dateFormatter.string(from: .now)
    }

    static func dateString(from date: Date) -> String {
        dateFormatter.string(from: date)
    }

    static func timeString(from date: Date) -> String {
        timeFormatter.string(from: date)
    }

    static func date(from string: String) -> Date? {
        dateFormatter.date(from: string)
    }

    static func isoString(from date: Date) -> String {
        iso8601.string(from: date)
    }

    static func weekDates(around date: Date = .now) -> [Date] {
        let calendar = Calendar.current
        let weekday = calendar.component(.weekday, from: date)
        let startOfWeek = calendar.date(byAdding: .day, value: -(weekday - 1), to: date)!
        return (0..<7).compactMap { calendar.date(byAdding: .day, value: $0, to: startOfWeek) }
    }

    static func dayOfWeekShort(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEE"
        return formatter.string(from: date)
    }

    static func dayNumber(_ date: Date) -> Int {
        Calendar.current.component(.day, from: date)
    }

    static func isToday(_ dateString: String) -> Bool {
        dateString == todayString()
    }

    static func streakLength(dates: [String]) -> Int {
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
