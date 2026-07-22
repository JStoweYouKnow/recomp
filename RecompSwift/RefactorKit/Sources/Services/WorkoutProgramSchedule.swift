import Foundation

/// Matches web `getWeekStart` / `matchDayToDate` / multi-week display filtering.
public enum WorkoutProgramSchedule {

    /// Monday 00:00 local time of the week containing `date` (same intent as recomp `getWeekStart`).
    public static func mondayWeekStart(containing date: Date) -> Date {
        let cal = Calendar.current
        let start = cal.startOfDay(for: date)
        let noon = cal.date(bySettingHour: 12, minute: 0, second: 0, of: start) ?? start
        let wd = cal.component(.weekday, from: noon) // 1 = Sunday … 7 = Saturday
        let daysFromMonday = wd == 1 ? -6 : -(wd - 2)
        return cal.date(byAdding: .day, value: daysFromMonday, to: start) ?? start
    }

    /// Whole weeks between two Monday week starts (`anchor` ≤ `other` → 0 for same week).
    public static func mondayWeeksElapsed(anchorMonday: Date, otherMonday: Date) -> Int {
        let days = Calendar.current.dateComponents([.day], from: anchorMonday, to: otherMonday).day ?? 0
        return days / 7
    }

    public static func extractProgramWeek(from dayLabel: String) -> Int? {
        let lower = dayLabel.lowercased()
        guard let w = lower.range(of: "week") else { return nil }
        var tail = String(lower[w.upperBound...])
        tail = String(tail.drop { $0 == " " || $0 == ":" })
        var num = ""
        for c in tail where c.isNumber { num.append(c) }
        return Int(num)
    }

    private static func weekdayMatches(planDay: String, dayName: String, shortName: String) -> Bool {
        let p = planDay.lowercased()
        return p == dayName || p == shortName || p.hasPrefix(dayName) || p.hasPrefix(shortName)
    }

    private static let weekdayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
    private static let shortNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]

    /// Index into `plan.workoutPlan.weeklyPlan` for the session scheduled on `date`, or nil.
    public static func planIndex(for plan: FitnessPlan, date: Date) -> Int? {
        let wp = plan.workoutPlan.weeklyPlan
        guard !wp.isEmpty else { return nil }

        let cal = Calendar.current
        let dow = cal.component(.weekday, from: date) // 1 = Sun … 7 = Sat
        let dayName = weekdayNames[dow - 1]
        let shortName = shortNames[dow - 1]

        if wp.count > 7 {
            if let anchor = plan.workoutPlan.programWeek1Start,
               let anchorDay = DateHelpers.date(from: anchor) {
                let selectedMonday = mondayWeekStart(containing: date)
                let anchorMonday = mondayWeekStart(containing: anchorDay)
                let programWeek = WorkoutScheduleService.effectiveProgramWeek(
                    for: plan,
                    weekStartMonday: DateHelpers.dateString(from: selectedMonday),
                    today: DateHelpers.todayString()
                )
                if programWeek >= 1 {
                    for i in wp.indices {
                        let pd = wp[i].day.lowercased()
                        if !weekdayMatches(planDay: pd, dayName: dayName, shortName: shortName) { continue }
                        if let wn = extractProgramWeek(from: pd), wn == programWeek { return i }
                    }
                }
                return nil
            }
            // Legacy sync: multi-week PDF rows but no anchor — scope to program week 1 only.
            for i in wp.indices {
                let pd = wp[i].day.lowercased()
                if !weekdayMatches(planDay: pd, dayName: dayName, shortName: shortName) { continue }
                if let wn = extractProgramWeek(from: pd), wn == 1 { return i }
            }
            return nil
        }

        for i in wp.indices {
            if weekdayMatches(planDay: wp[i].day.lowercased(), dayName: dayName, shortName: shortName) {
                return i
            }
        }

        if !planUsesNamedWeekdays(wp) {
            let mondayBased = (dow + 5) % 7 // Mon = 0 … Sun = 6 (matches web)
            if mondayBased < wp.count { return mondayBased }
        }
        return nil
    }

    private static func planUsesNamedWeekdays(_ weeklyPlan: [WorkoutDay]) -> Bool {
        weeklyPlan.contains { day in
            let p = day.day.lowercased()
            return weekdayNames.contains { p.hasPrefix($0) } || shortNames.contains { p.hasPrefix($0) }
        }
    }

    /// Rows to show on the Workouts tab: full week for classic 7-day plans; current program week only for PDF-style plans.
    public static func displayedPlanItems(plan: FitnessPlan, selectedDate: Date) -> [WorkoutPlanDisplayItem] {
        let wp = plan.workoutPlan.weeklyPlan
        if wp.count > 7 {
            if let anchor = plan.workoutPlan.programWeek1Start,
               let anchorDay = DateHelpers.date(from: anchor) {
                let selectedMonday = mondayWeekStart(containing: selectedDate)
                let anchorMonday = mondayWeekStart(containing: anchorDay)
                var programWeek = WorkoutScheduleService.effectiveProgramWeek(
                    for: plan,
                    weekStartMonday: DateHelpers.dateString(from: selectedMonday),
                    today: DateHelpers.todayString()
                )
                if programWeek < 1 { programWeek = 1 }
                let filtered = wp.enumerated().filter { _, day in
                    extractProgramWeek(from: day.day) == programWeek
                }
                if !filtered.isEmpty {
                    return filtered.map { WorkoutPlanDisplayItem(planIndex: $0.offset, day: $0.element) }
                }
            } else {
                let week1 = wp.enumerated().filter { _, day in extractProgramWeek(from: day.day) == 1 }
                if !week1.isEmpty {
                    return week1.map { WorkoutPlanDisplayItem(planIndex: $0.offset, day: $0.element) }
                }
            }
        }
        return wp.enumerated().map { WorkoutPlanDisplayItem(planIndex: $0.offset, day: $0.element) }
    }

    /// `yyyy-MM-dd` for the calendar column that matches this session’s weekday in the week containing `selectedDate`.
    /// Uses Sunday-first week alignment to match `weekdayAlignedDayKeys` in WorkoutsView.
    public static func progressDayKey(for workoutDay: WorkoutDay, weekContaining selectedDate: Date) -> String {
        let cal = Calendar.current
        let start = cal.startOfDay(for: selectedDate)
        let wk = cal.component(.weekday, from: start)
        guard let sunday = cal.date(byAdding: .day, value: -(wk - 1), to: start) else {
            return DateHelpers.dateString(from: selectedDate)
        }
        let offset = weekdayOffsetFromSunday(dayLabel: workoutDay.day)
        guard let target = cal.date(byAdding: .day, value: offset, to: sunday) else {
            return DateHelpers.dateString(from: selectedDate)
        }
        return DateHelpers.dateString(from: target)
    }

    /// 0 = Sunday … 6 = Saturday from plan label.
    private static func weekdayOffsetFromSunday(dayLabel: String) -> Int {
        let l = dayLabel.lowercased()
        if l.hasPrefix("sunday") { return 0 }
        if l.hasPrefix("monday") { return 1 }
        if l.hasPrefix("tuesday") { return 2 }
        if l.hasPrefix("wednesday") { return 3 }
        if l.hasPrefix("thursday") { return 4 }
        if l.hasPrefix("friday") { return 5 }
        if l.hasPrefix("saturday") { return 6 }
        return 0
    }
}

public struct WorkoutPlanDisplayItem: Identifiable, Sendable {
    public let id: String
    public let planIndex: Int
    public let day: WorkoutDay

    public init(planIndex: Int, day: WorkoutDay) {
        self.planIndex = planIndex
        self.day = day
        self.id = "\(planIndex)-\(day.day)"
    }
}
