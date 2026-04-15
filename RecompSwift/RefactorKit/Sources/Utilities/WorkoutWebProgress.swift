import Foundation

/// Web `WorkoutPlannerView.exerciseKey` string format for `/api/data/sync` `workoutProgress`.
public enum WorkoutWebProgress {

    public static func legacyKey(
        planId: String,
        dayLabel: String,
        section: String,
        exercise: WorkoutExercise
    ) -> String {
        let notes = exercise.notes ?? ""
        if section == "main" {
            return "\(planId):\(dayLabel):\(exercise.name):\(exercise.sets):\(exercise.reps):\(notes)"
        }
        return "\(planId):\(dayLabel):\(section):\(exercise.name):\(exercise.sets):\(exercise.reps):\(notes)"
    }

    public static func weekScopedKey(
        planId: String,
        weekStartMondayYyyyMmDd: String,
        dayLabel: String,
        section: String,
        exercise: WorkoutExercise
    ) -> String {
        let notes = exercise.notes ?? ""
        return "\(planId):\(weekStartMondayYyyyMmDd):\(dayLabel):\(section):\(exercise.name):\(exercise.sets):\(exercise.reps):\(notes)"
    }

    /// Section (`warmup` / `main` / `finisher`) for the flat slot index on `day`.
    public static func sectionForExerciseSlot(day: WorkoutDay, globalSlot: Int) -> String {
        sectionForSlot(day: day, globalSlot: globalSlot)
    }

    /// Local-only key for per-set checkmarks in `WorkoutService`. Tied to exercise identity + day label, not
    /// `weeklyPlan` array index, so adding/reordering days does not move completions between rows.
    public static func localRowSetProgressKey(
        planId: String,
        dayLabel: String,
        section: String,
        exercise: WorkoutExercise,
        globalSlot: Int
    ) -> String {
        "\(legacyKey(planId: planId, dayLabel: dayLabel, section: section, exercise: exercise))#\(globalSlot)"
    }

    /// Parsed server key → locate row in `weeklyPlan`.
    public struct ParsedKey: Sendable {
        public let dayLabel: String
        public let section: String
        public let exercise: WorkoutExercise
    }

    public static func parseKey(_ key: String, planId: String) -> ParsedKey? {
        guard key.hasPrefix("\(planId):") else { return nil }
        let rest = String(key.dropFirst(planId.count + 1))
        let parts = rest.split(separator: ":", omittingEmptySubsequences: false).map(String.init)
        guard !parts.isEmpty else { return nil }

        let p1 = parts[0]
        if p1.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil {
            // planId : weekStart : day : section : name : sets : reps : notes...
            guard parts.count >= 8 else { return nil }
            let dayLabel = parts[2]
            let section = parts[3]
            let name = parts[4]
            let sets = parts[5]
            let reps = parts[6]
            let notes = parts.dropFirst(7).joined(separator: ":")
            let ex = WorkoutExercise(
                name: name,
                sets: sets,
                reps: reps,
                notes: notes.isEmpty ? nil : notes
            )
            return ParsedKey(dayLabel: dayLabel, section: section, exercise: ex)
        }

        // Legacy: planId : day : (warmup|finisher) : name : sets : reps : notes
        if parts.count >= 7, parts[2] == "warmup" || parts[2] == "finisher" {
            let dayLabel = parts[1]
            let section = parts[2]
            let name = parts[3]
            let sets = parts[4]
            let reps = parts[5]
            let notes = parts.dropFirst(6).joined(separator: ":")
            let ex = WorkoutExercise(name: name, sets: sets, reps: reps, notes: notes.isEmpty ? nil : notes)
            return ParsedKey(dayLabel: dayLabel, section: section, exercise: ex)
        }

        // Legacy main: planId : day : name : sets : reps : notes
        guard parts.count >= 6 else { return nil }
        let dayLabel = parts[1]
        let name = parts[2]
        let sets = parts[3]
        let reps = parts[4]
        let notes = parts.dropFirst(5).joined(separator: ":")
        let ex = WorkoutExercise(name: name, sets: sets, reps: reps, notes: notes.isEmpty ? nil : notes)
        return ParsedKey(dayLabel: dayLabel, section: "main", exercise: ex)
    }

    /// Finds `planIndex` and `globalSlot` for a parsed key in the given plan.
    public static func locateSlot(parsed: ParsedKey, in plan: FitnessPlan) -> (planIndex: Int, globalSlot: Int)? {
        let wp = plan.workoutPlan.weeklyPlan
        for (planIndex, day) in wp.enumerated() where day.day == parsed.dayLabel {
            for (slot, ex) in day.enumeratedExerciseSlots() {
                let sec = sectionForSlot(day: day, globalSlot: slot)
                guard sec == parsed.section else { continue }
                if ex.name == parsed.exercise.name,
                   ex.sets == parsed.exercise.sets,
                   ex.reps == parsed.exercise.reps,
                   (ex.notes ?? "") == (parsed.exercise.notes ?? "") {
                    return (planIndex: planIndex, globalSlot: slot)
                }
            }
        }
        return nil
    }

    private static func sectionForSlot(day: WorkoutDay, globalSlot: Int) -> String {
        let w = day.warmups?.count ?? 0
        let m = day.exercises.count
        if globalSlot < w { return "warmup" }
        if globalSlot < w + m { return "main" }
        return "finisher"
    }
}
