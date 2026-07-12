import Foundation

/// Matches web `workout-import-start.ts` — anchor imported / multi-week programs to the next session weekday.
public enum WorkoutImportStart {
    private static let weekdayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
    private static let shortNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]

    /// 0 = Sunday … 6 = Saturday (matches JavaScript `Date.getDay()`).
    public static func weekdayIndex(from dayLabel: String) -> Int? {
        let lower = dayLabel.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        for (i, name) in weekdayNames.enumerated() {
            if lower == name || lower.hasPrefix("\(name) ") || lower.hasPrefix(shortNames[i]) {
                return i
            }
        }
        return nil
    }

    public static func extractProgramWeek(from dayLabel: String) -> Int? {
        let pattern = #"week\s*(\d+)"#
        guard let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive),
              let match = regex.firstMatch(in: dayLabel, range: NSRange(dayLabel.startIndex..., in: dayLabel)),
              let range = Range(match.range(at: 1), in: dayLabel),
              let n = Int(dayLabel[range]) else { return nil }
        return n
    }

    public static func isAnchoredProgram(_ weeklyPlan: [WorkoutDay]) -> Bool {
        weeklyPlan.count > 7 || weeklyPlan.contains { extractProgramWeek(from: $0.day) != nil }
    }

    public static func nextOccurrence(ofWeekday weekdayIndex: Int, today: String = DateHelpers.todayString()) -> String {
        guard let todayDate = DateHelpers.date(from: today) else { return today }
        let cal = Calendar.current
        let noon = cal.date(bySettingHour: 12, minute: 0, second: 0, of: todayDate) ?? todayDate
        let todayDow = cal.component(.weekday, from: noon) - 1
        let daysUntil = (weekdayIndex - todayDow + 7) % 7
        guard let next = cal.date(byAdding: .day, value: daysUntil, to: noon) else { return today }
        return DateHelpers.dateString(from: next)
    }

    public static func inferFirstSessionDate(weeklyPlan: [WorkoutDay], today: String = DateHelpers.todayString()) -> String {
        let first = weeklyPlan.first(where: { !$0.day.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }) ?? weeklyPlan.first
        guard let day = first else { return nextOccurrence(ofWeekday: 1, today: today) }
        if let wd = weekdayIndex(from: day.day) {
            return nextOccurrence(ofWeekday: wd, today: today)
        }
        return nextOccurrence(ofWeekday: 1, today: today)
    }

    public static func inferProgramWeek1Start(weeklyPlan: [WorkoutDay], today: String = DateHelpers.todayString()) -> String? {
        guard !weeklyPlan.isEmpty, isAnchoredProgram(weeklyPlan) else { return nil }
        return DateHelpers.mondayWeekStartString(
            containingCalendarDay: inferFirstSessionDate(weeklyPlan: weeklyPlan, today: today)
        )
    }

    public static func workoutPlanAfterImport(weeklyPlan: [WorkoutDay], preserving existing: WorkoutPlan) -> WorkoutPlan {
        var wp = existing
        wp.weeklyPlan = weeklyPlan
        if let anchor = inferProgramWeek1Start(weeklyPlan: weeklyPlan) {
            wp.programWeek1Start = anchor
            wp.programWeekOffset = 0
            wp.missedSessions = []
            wp.catchUpBannerDismissedAt = nil
        } else if weeklyPlan.count <= 7 {
            wp.programWeek1Start = nil
        }
        return wp
    }
}
