import Foundation

public struct CompletedSessionSummary: Codable, Sendable, Equatable {
    public let date: String
    public let planIndex: Int
    public let day: String
    public let focus: String
    public let exercisesCompleted: [String]
    public let exerciseCount: Int
}

public struct WorkoutHistorySummary: Codable, Sendable, Equatable {
    public let sessionsCompletedLast7Days: Int
    public let sessionsCompletedLast14Days: Int
    public let recentSessions: [CompletedSessionSummary]
    public let exerciseFrequency: [String: Int]
    public let focusFrequency: [String: Int]
}

public struct NextWorkoutPreview: Codable, Sendable, Equatable {
    public let planIndex: Int
    public let day: String
    public let focus: String
    public let scheduledDate: String?
    public let mainExercises: [String]
}

public enum WorkoutLearningService {

    public static func buildRicoWorkoutLearningContext(
        plan: FitnessPlan?,
        progress: [String: String],
        today: String = DateHelpers.todayString()
    ) -> (history: WorkoutHistorySummary?, completedToday: CompletedSessionSummary?, nextWorkout: NextWorkoutPreview?) {
        guard let plan else { return (nil, nil, nil) }
        let history = buildWorkoutHistorySummary(plan: plan, progress: progress, today: today)
        let completedToday = completedSession(for: plan, progress: progress, date: today)
        let next = findNextScheduledWorkout(plan: plan, progress: progress, today: today)
        return (history, completedToday, next)
    }

    public static func detectNewlyCompletedSession(
        plan: FitnessPlan,
        oldProgress: [String: String],
        newProgress: [String: String],
        date: String
    ) -> CompletedSessionSummary? {
        guard let planIndex = WorkoutProgramSchedule.planIndex(for: plan, date: DateHelpers.date(from: date) ?? .now) else {
            return nil
        }
        let wasComplete = WorkoutScheduleService.isWorkoutSessionComplete(
            plan: plan, planIndex: planIndex, date: date, progress: oldProgress
        )
        let isComplete = WorkoutScheduleService.isWorkoutSessionComplete(
            plan: plan, planIndex: planIndex, date: date, progress: newProgress
        )
        guard !wasComplete, isComplete else { return nil }
        return summarizeSession(plan: plan, planIndex: planIndex, date: date, progress: newProgress)
    }

    private static func completedSession(
        for plan: FitnessPlan,
        progress: [String: String],
        date: String
    ) -> CompletedSessionSummary? {
        guard let planIndex = WorkoutProgramSchedule.planIndex(for: plan, date: DateHelpers.date(from: date) ?? .now) else {
            return nil
        }
        return summarizeSession(plan: plan, planIndex: planIndex, date: date, progress: progress)
    }

    private static func summarizeSession(
        plan: FitnessPlan,
        planIndex: Int,
        date: String,
        progress: [String: String]
    ) -> CompletedSessionSummary? {
        guard WorkoutScheduleService.isWorkoutSessionComplete(
            plan: plan, planIndex: planIndex, date: date, progress: progress
        ) else { return nil }
        guard planIndex >= 0, planIndex < plan.workoutPlan.weeklyPlan.count else { return nil }
        let day = plan.workoutPlan.weeklyPlan[planIndex]
        let names = allExerciseNames(day: day)
        return CompletedSessionSummary(
            date: date,
            planIndex: planIndex,
            day: day.day,
            focus: day.focus,
            exercisesCompleted: names,
            exerciseCount: names.count
        )
    }

    private static func buildWorkoutHistorySummary(
        plan: FitnessPlan,
        progress: [String: String],
        lookbackDays: Int = 28,
        today: String
    ) -> WorkoutHistorySummary {
        var sessions: [CompletedSessionSummary] = []
        var seen = Set<String>()
        for offset in 0..<lookbackDays {
            guard let dateStr = DateHelpers.offsetDate(today, by: -offset) else { continue }
            guard let planIndex = WorkoutProgramSchedule.planIndex(for: plan, date: DateHelpers.date(from: dateStr) ?? .now) else {
                continue
            }
            let key = "\(planIndex):\(dateStr)"
            if seen.contains(key) { continue }
            guard let summary = summarizeSession(plan: plan, planIndex: planIndex, date: dateStr, progress: progress) else {
                continue
            }
            seen.insert(key)
            sessions.append(summary)
        }
        sessions.sort { $0.date > $1.date }

        var exerciseFrequency: [String: Int] = [:]
        var focusFrequency: [String: Int] = [:]
        for session in sessions {
            let focusKey = session.focus.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            if !focusKey.isEmpty { focusFrequency[focusKey, default: 0] += 1 }
            for name in session.exercisesCompleted {
                let key = name.lowercased()
                exerciseFrequency[key, default: 0] += 1
            }
        }

        return WorkoutHistorySummary(
            sessionsCompletedLast7Days: sessions.filter { withinDays($0.date, of: today, days: 7) }.count,
            sessionsCompletedLast14Days: sessions.filter { withinDays($0.date, of: today, days: 14) }.count,
            recentSessions: Array(sessions.prefix(8)),
            exerciseFrequency: exerciseFrequency,
            focusFrequency: focusFrequency
        )
    }

    private static func findNextScheduledWorkout(
        plan: FitnessPlan,
        progress: [String: String],
        today: String,
        horizonDays: Int = 14
    ) -> NextWorkoutPreview? {
        for offset in 0...horizonDays {
            guard let dateStr = DateHelpers.offsetDate(today, by: offset) else { continue }
            guard let planIndex = WorkoutProgramSchedule.planIndex(for: plan, date: DateHelpers.date(from: dateStr) ?? .now) else {
                continue
            }
            if WorkoutScheduleService.isWorkoutSessionComplete(
                plan: plan, planIndex: planIndex, date: dateStr, progress: progress
            ) { continue }
            guard planIndex >= 0, planIndex < plan.workoutPlan.weeklyPlan.count else { continue }
            let day = plan.workoutPlan.weeklyPlan[planIndex]
            return NextWorkoutPreview(
                planIndex: planIndex,
                day: day.day,
                focus: day.focus,
                scheduledDate: dateStr,
                mainExercises: day.exercises.map(\.name).filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
            )
        }
        return nil
    }

    private static func allExerciseNames(day: WorkoutDay) -> [String] {
        var names: [String] = []
        for ex in day.warmups ?? [] where !ex.name.trimmingCharacters(in: .whitespaces).isEmpty { names.append(ex.name) }
        for ex in day.exercises where !ex.name.trimmingCharacters(in: .whitespaces).isEmpty { names.append(ex.name) }
        for ex in day.finishers ?? [] where !ex.name.trimmingCharacters(in: .whitespaces).isEmpty { names.append(ex.name) }
        return names
    }

    private static func withinDays(_ date: String, of today: String, days: Int) -> Bool {
        guard let d = DateHelpers.date(from: date), let t = DateHelpers.date(from: today) else { return false }
        let cutoff = Calendar.current.date(byAdding: .day, value: -days, to: t) ?? t
        return d >= cutoff
    }
}
