import Foundation

/// Shared workout scheduling: program week resolution, missed-session detection, catch-up queue.
public enum WorkoutScheduleService {

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
            if isWorkoutSessionComplete(plan: plan, planIndex: planIndex, date: dateStr, progress: progress) { continue }
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
        let tracked = (plan.workoutPlan.missedSessions ?? []).filter {
            $0.status == .missed && $0.scheduledDate >= (DateHelpers.offsetDate(today, by: -days) ?? "")
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

    public static func dismissCatchUpBanner(plan: FitnessPlan, at: String = ISO8601DateFormatter().string(from: .now)) -> FitnessPlan {
        var copy = plan
        copy.workoutPlan.catchUpBannerDismissedAt = at
        return copy
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
        let day = plan.workoutPlan.weeklyPlan[planIndex]
        return MissedSession(
            id: sessionId(planIndex: planIndex, scheduledDate: scheduledDate),
            planIndex: planIndex,
            scheduledDate: scheduledDate,
            status: status,
            rescheduledTo: rescheduledTo,
            dayLabel: day.day,
            focus: day.focus
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
        let done = slots.filter { pair in
            let section = WorkoutWebProgress.sectionForExerciseSlot(day: day, globalSlot: pair.globalSlot)
            let key = WorkoutWebProgress.legacyKey(
                planId: plan.id,
                dayLabel: day.day,
                section: section,
                exercise: pair.exercise
            )
            return progress[key]?.prefix(10) == Substring(date)
        }.count
        return done >= slots.count
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
