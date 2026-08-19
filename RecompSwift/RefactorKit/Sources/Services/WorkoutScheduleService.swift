import Foundation

/// Shared workout scheduling: program week resolution, missed-session detection, catch-up queue.
public enum WorkoutScheduleService {

    /// 1-based count of calendar weeks the lifter has been training this plan.
    ///
    /// Distinct from `effectiveProgramWeek`, which answers "which week's template applies" and
    /// deliberately pins single-week plans to 1 so weekday matching keeps working. Periodization
    /// needs elapsed training time instead, so a repeating one-week plan still advances through
    /// accumulation → peak → deload. Falls back to the plan's creation date when no explicit
    /// program anchor was set.
    public static func trainingWeeksElapsed(
        for plan: FitnessPlan,
        today: String = DateHelpers.todayString()
    ) -> Int {
        let anchor = plan.workoutPlan.programWeek1Start
            ?? DateHelpers.dateString(from: plan.createdAt)
        let weeks = DateHelpers.mondayWeeksElapsed(
            from: DateHelpers.mondayWeekStartString(containingCalendarDay: anchor),
            to: DateHelpers.mondayWeekStartString(containingCalendarDay: today)
        )
        return Swift.max(1, weeks + 1)
    }

    public static func effectiveProgramWeek(
        for plan: FitnessPlan,
        weekStartMonday: String,
        today: String = DateHelpers.todayString()
    ) -> Int {
        let wp = plan.workoutPlan
        guard let anchor = wp.programWeek1Start, wp.weeklyPlan.count > 7 else { return 1 }

        if let paused = wp.pausedUntil, weekStartMonday <= paused {
            let pausedWeekStart = DateHelpers.weekStartMonday(containing: paused)
            let baseAtPause = DateHelpers.mondayWeeksElapsed(from: anchor, to: pausedWeekStart) + 1
            let offset = wp.programWeekOffset ?? 0
            return max(1, baseAtPause - offset)
        }

        let elapsed = DateHelpers.mondayWeeksElapsed(from: anchor, to: weekStartMonday) + 1
        let offset = wp.programWeekOffset ?? 0
        var week = max(1, elapsed - offset)

        if wp.advancementMode == .completion {
            let maxCalendarWeek = elapsed
            while week < maxCalendarWeek && isProgramWeekFullyComplete(plan: plan, programWeek: week, progress: [:]) {
                week += 1
            }
            week = min(week, maxCalendarWeek)
        }

        return week
    }

    public static func detectMissedSessions(
        plan: FitnessPlan,
        progress: [String: String],
        today: String = DateHelpers.todayString(),
        lookbackDays: Int = 14
    ) -> [MissedSession] {
        var known = Set((plan.workoutPlan.missedSessions ?? []).map(\.id))
        var found: [MissedSession] = []

        for i in 1...lookbackDays {
            guard let dateStr = DateHelpers.offsetDate(today, by: -i) else { continue }
            guard let planIndex = WorkoutProgramSchedule.planIndex(for: plan, date: DateHelpers.date(from: dateStr) ?? .now) else {
                continue
            }
            let id = sessionId(planIndex: planIndex, scheduledDate: dateStr)
            if known.contains(id) { continue }
            let alreadyTracked = (plan.workoutPlan.missedSessions ?? []).contains {
                $0.planIndex == planIndex && $0.scheduledDate == dateStr && $0.status != .missed
            }
            if alreadyTracked { continue }
            if isWorkoutSessionComplete(plan: plan, planIndex: planIndex, date: dateStr, progress: progress) { continue }
            guard planIndex < plan.workoutPlan.weeklyPlan.count else { continue }
            let day = plan.workoutPlan.weeklyPlan[planIndex]
            found.append(MissedSession(
                id: id,
                planIndex: planIndex,
                scheduledDate: dateStr,
                status: .missed,
                dayLabel: day.day,
                focus: day.focus
            ))
        }
        return found
    }

    public static func getCatchUpQueue(plan: FitnessPlan) -> [MissedSession] {
        (plan.workoutPlan.missedSessions ?? [])
            .filter { $0.status == .missed || ($0.status == .rescheduled && $0.rescheduledTo != nil) }
            .sorted { $0.scheduledDate < $1.scheduledDate }
    }

    public static func countRecentMissed(
        plan: FitnessPlan,
        progress: [String: String],
        days: Int = 7,
        today: String = DateHelpers.todayString()
    ) -> Int {
        let detected = detectMissedSessions(plan: plan, progress: progress, today: today, lookbackDays: days)
        let dayCount = plan.workoutPlan.weeklyPlan.count
        let tracked = (plan.workoutPlan.missedSessions ?? []).filter {
            $0.status == .missed &&
                // Entries orphaned by a regenerated or shortened plan point at days that no longer
                // exist. Counting them inflates the missed total and triggers a phantom catch-up banner.
                $0.planIndex >= 0 && $0.planIndex < dayCount &&
                $0.scheduledDate >= (DateHelpers.offsetDate(today, by: -days) ?? "") &&
                !isWorkoutSessionComplete(plan: plan, planIndex: $0.planIndex, date: $0.scheduledDate, progress: progress)
        }
        var ids = Set(detected.map(\.id))
        for s in tracked { ids.insert(s.id) }
        return ids.count
    }

    public static func shouldShowCatchUpBanner(
        plan: FitnessPlan,
        progress: [String: String],
        today: String = DateHelpers.todayString()
    ) -> Bool {
        if let dismissed = plan.workoutPlan.catchUpBannerDismissedAt,
           dismissed.prefix(10) == Substring(today) {
            return false
        }
        return countRecentMissed(plan: plan, progress: progress, days: 7, today: today) >= 2
    }

    public static func applyScheduleAction(
        plan: FitnessPlan,
        action: ScheduleAction,
        progress: [String: String],
        today: String = DateHelpers.todayString(),
        planIndex: Int? = nil,
        scheduledDate: String? = nil,
        rescheduledTo: String? = nil,
        weeksMissed: Int? = nil
    ) -> (workoutPlan: WorkoutPlan, summary: String, addedMissed: [MissedSession]) {
        var wp = plan.workoutPlan
        var missed = wp.missedSessions ?? []
        var addedMissed: [MissedSession] = []
        var summary = ""
        let detected = detectMissedSessions(plan: plan, progress: progress, today: today)

        switch action {
        case .stayOnWeek, .repeatWeek:
            let weeks = weeksMissed ?? max(1, Int(ceil(Double(countRecentMissed(plan: plan, progress: progress, today: today)) / 3.0)))
            wp.programWeekOffset = (wp.programWeekOffset ?? 0) + weeks
            summary = "Staying on your current program week (offset +\(weeks))."
            for s in detected {
                var entry = s
                entry.status = .skipped
                addedMissed.append(entry)
                missed = upsertMissedSession(missed, entry)
            }
        case .skipWeek:
            for s in detected {
                var entry = s
                entry.status = .skipped
                addedMissed.append(entry)
                missed = upsertMissedSession(missed, entry)
            }
            summary = "Skipped \(addedMissed.count) missed session(s) and continuing on your calendar schedule."
        case .catchUp:
            for s in detected {
                addedMissed.append(s)
                missed = upsertMissedSession(missed, s)
            }
            if wp.advancementMode == nil { wp.advancementMode = .calendar }
            summary = addedMissed.isEmpty ? "Catch-up queue is up to date." : "Added \(addedMissed.count) session(s) to your catch-up queue."
        case .skipToday:
            let idx = planIndex ?? WorkoutProgramSchedule.planIndex(for: plan, date: DateHelpers.date(from: today) ?? .now)
            if let idx {
                let entry = makeMissedEntry(plan: plan, planIndex: idx, scheduledDate: today, status: .skipped)
                addedMissed.append(entry)
                missed = upsertMissedSession(missed, entry)
                summary = "Skipped today's workout."
            } else {
                summary = "No workout scheduled for today."
            }
        case .reschedule:
            if let idx = planIndex, let scheduledDate, let rescheduledTo {
                let entry = makeMissedEntry(
                    plan: plan,
                    planIndex: idx,
                    scheduledDate: scheduledDate,
                    status: .rescheduled,
                    rescheduledTo: rescheduledTo
                )
                addedMissed.append(entry)
                missed = upsertMissedSession(missed, entry)
                summary = "Rescheduled session to \(rescheduledTo)."
            } else {
                summary = "Reschedule requires planIndex, scheduledDate, and rescheduledTo."
            }
        }

        wp.missedSessions = missed
        wp.catchUpBannerDismissedAt = nil
        return (wp, summary, addedMissed)
    }

    public static func dismissCatchUpBanner(
        plan: FitnessPlan,
        at: String = catchUpBannerDismissedTimestamp()
    ) -> FitnessPlan {
        var copy = plan
        copy.workoutPlan.catchUpBannerDismissedAt = at
        return copy
    }

    /// ISO timestamp with a local-date prefix so [shouldShowCatchUpBanner] can compare `prefix(10)` to [DateHelpers.todayString].
    public static func catchUpBannerDismissedTimestamp(now: Date = .now) -> String {
        let localToday = DateHelpers.todayString()
        let iso = DateHelpers.isoString(from: now)
        guard let tIndex = iso.firstIndex(of: "T") else {
            return "\(localToday)T12:00:00.000Z"
        }
        return localToday + String(iso[tIndex...])
    }

    // MARK: - Private helpers

    private static func sessionId(planIndex: Int, scheduledDate: String) -> String {
        "\(planIndex):\(scheduledDate)"
    }

    private static func upsertMissedSession(_ sessions: [MissedSession], _ entry: MissedSession) -> [MissedSession] {
        var next = sessions.filter { $0.id != entry.id }
        next.append(entry)
        return next
    }

    private static func makeMissedEntry(
        plan: FitnessPlan,
        planIndex: Int,
        scheduledDate: String,
        status: MissedSessionStatus,
        rescheduledTo: String? = nil
    ) -> MissedSession {
        let dayLabel: String
        let focus: String?
        if planIndex >= 0, planIndex < plan.workoutPlan.weeklyPlan.count {
            let day = plan.workoutPlan.weeklyPlan[planIndex]
            dayLabel = day.day
            focus = day.focus
        } else {
            dayLabel = "Workout"
            focus = nil
        }
        return MissedSession(
            id: sessionId(planIndex: planIndex, scheduledDate: scheduledDate),
            planIndex: planIndex,
            scheduledDate: scheduledDate,
            status: status,
            rescheduledTo: rescheduledTo,
            dayLabel: dayLabel,
            focus: focus
        )
    }

    public static func isWorkoutSessionComplete(
        plan: FitnessPlan,
        planIndex: Int,
        date: String,
        progress: [String: String]
    ) -> Bool {
        guard planIndex >= 0, planIndex < plan.workoutPlan.weeklyPlan.count else { return false }
        let day = plan.workoutPlan.weeklyPlan[planIndex]
        let slots = day.enumeratedExerciseSlots()
        guard !slots.isEmpty else { return false }

        let weekStart = DateHelpers.mondayWeekStartString(containingCalendarDay: date)
        let weekProgress = progressForDate(plan: plan, date: date, progress: progress)

        let done = slots.filter { pair in
            let section = WorkoutWebProgress.sectionForExerciseSlot(day: day, globalSlot: pair.globalSlot)
            let legacy = WorkoutWebProgress.legacyKey(
                planId: plan.id,
                dayLabel: day.day,
                section: section,
                exercise: pair.exercise
            )
            let scoped = WorkoutWebProgress.weekScopedKey(
                planId: plan.id,
                weekStartMondayYyyyMmDd: weekStart,
                dayLabel: day.day,
                section: section,
                exercise: pair.exercise
            )
            let ts = weekProgress[legacy] ?? progress[scoped] ?? progress[legacy]
            return ts?.prefix(10) == Substring(date)
        }.count

        return done >= slots.count
    }

    private static func progressForDate(
        plan: FitnessPlan,
        date: String,
        progress: [String: String]
    ) -> [String: String] {
        let weekStart = DateHelpers.mondayWeekStartString(containingCalendarDay: date)
        var filtered: [String: String] = [:]
        for (key, ts) in progress {
            guard !ts.isEmpty else { continue }
            guard let legacy = legacyLookupKey(from: key, planId: plan.id) else { continue }
            let parts = key.split(separator: ":", omittingEmptySubsequences: false)
            let isWeekScoped = parts.count > 1 && parts[1].range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil
            if isWeekScoped, String(parts[1]) == weekStart {
                filtered[legacy] = ts
            } else if !isWeekScoped, isTimestampInWeek(ts, weekStartMonday: weekStart) {
                filtered[legacy] = ts
            }
        }
        return filtered
    }

    private static func legacyLookupKey(from key: String, planId: String) -> String? {
        guard let parsed = WorkoutWebProgress.parseKey(key, planId: planId) else { return nil }
        return WorkoutWebProgress.legacyKey(
            planId: planId,
            dayLabel: parsed.dayLabel,
            section: parsed.section,
            exercise: parsed.exercise
        )
    }

    private static func isTimestampInWeek(_ isoTimestamp: String, weekStartMonday: String) -> Bool {
        let ts = String(isoTimestamp.prefix(10))
        guard let tsDate = DateHelpers.date(from: ts),
              let startDate = DateHelpers.date(from: weekStartMonday),
              let endDate = Calendar.current.date(byAdding: .day, value: 7, to: startDate)
        else { return false }
        return tsDate >= startDate && tsDate < endDate
    }

    private static func isProgramWeekFullyComplete(
        plan: FitnessPlan,
        programWeek: Int,
        progress: [String: String]
    ) -> Bool {
        let sessions = plan.workoutPlan.weeklyPlan.enumerated().filter { _, day in
            WorkoutProgramSchedule.extractProgramWeek(from: day.day) == programWeek
        }
        guard !sessions.isEmpty else { return false }
        return sessions.allSatisfy { idx, _ in
            isWorkoutSessionComplete(
                plan: plan,
                planIndex: idx,
                date: DateHelpers.todayString(),
                progress: progress
            )
        }
    }
}
