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
        /// Monday `yyyy-MM-dd` of the week this completion belongs to (week-scoped keys only).
        /// Use this to derive the calendar `dayKey` instead of the UTC timestamp to avoid
        /// timezone-induced off-by-one-day mismatches.
        public let weekStartMonday: String?
    }

    public static func parseKey(_ key: String, planId: String) -> ParsedKey? {
        guard key.hasPrefix("\(planId):") else { return nil }
        let rest = String(key.dropFirst(planId.count + 1))
        let parts = rest.split(separator: ":", omittingEmptySubsequences: false).map(String.init)
        guard !parts.isEmpty else { return nil }

        let p1 = parts[0]
        if p1.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil {
            // After stripping planId: parts = [weekStart, dayLabel, section, name, sets, reps, notes?]
            //   parts[0]=weekStart  parts[1]=dayLabel  parts[2]=section
            //   parts[3]=name       parts[4]=sets       parts[5]=reps  parts[6+]=notes
            guard parts.count >= 6 else { return nil }
            let weekStart = parts[0]
            let dayLabel = parts[1]
            let section = parts[2]
            let name = parts[3]
            let sets = parts[4]
            let reps = parts[5]
            let notes = parts.dropFirst(6).joined(separator: ":")
            let ex = WorkoutExercise(
                name: name,
                sets: sets,
                reps: reps,
                notes: notes.isEmpty ? nil : notes
            )
            return ParsedKey(dayLabel: dayLabel, section: section, exercise: ex, weekStartMonday: weekStart)
        }

        // Legacy non-main: planId : day : warmup|finisher : name : sets : reps : notes
        // parts[0]=dayLabel  parts[1]=section  parts[2]=name  parts[3]=sets  parts[4]=reps  parts[5+]=notes
        if parts.count >= 6, parts[1] == "warmup" || parts[1] == "finisher" {
            let dayLabel = parts[0]
            let section = parts[1]
            let name = parts[2]
            let sets = parts[3]
            let reps = parts[4]
            let notes = parts.dropFirst(5).joined(separator: ":")
            let ex = WorkoutExercise(name: name, sets: sets, reps: reps, notes: notes.isEmpty ? nil : notes)
            return ParsedKey(dayLabel: dayLabel, section: section, exercise: ex, weekStartMonday: nil)
        }

        // Legacy main: planId : day : name : sets : reps : notes
        // parts[0]=dayLabel  parts[1]=name  parts[2]=sets  parts[3]=reps  parts[4+]=notes
        guard parts.count >= 5 else { return nil }
        let dayLabel = parts[0]
        let name = parts[1]
        let sets = parts[2]
        let reps = parts[3]
        let notes = parts.dropFirst(4).joined(separator: ":")
        let ex = WorkoutExercise(name: name, sets: sets, reps: reps, notes: notes.isEmpty ? nil : notes)
        return ParsedKey(dayLabel: dayLabel, section: "main", exercise: ex, weekStartMonday: nil)
    }

    /// Finds `planIndex` and `globalSlot` for a parsed key in the given plan.
    ///
    /// Uses a two-pass strategy:
    /// 1. Exact match on name + sets + reps + notes (preserves precision).
    /// 2. Name-only fallback — handles cases where sets/reps/notes were corrected
    ///    after the server key was written (e.g. the PDF rep-count correction).
    ///
    /// Day label matching accepts prefix containment so "Monday" matches plan days
    /// labelled "Monday — Week 1", and vice-versa.
    public static func locateSlot(parsed: ParsedKey, in plan: FitnessPlan) -> (planIndex: Int, globalSlot: Int)? {
        let wp = plan.workoutPlan.weeklyPlan
        let targetDay = parsed.dayLabel.lowercased()

        // Indices of plan days whose label matches (exact or prefix-contained).
        let matchingDays = wp.enumerated().filter { _, day in
            let d = day.day.lowercased()
            return d == targetDay || d.hasPrefix(targetDay) || targetDay.hasPrefix(d)
        }

        // Pass 1 — exact match (name + sets + reps + notes).
        for (planIndex, day) in matchingDays {
            for (slot, ex) in day.enumeratedExerciseSlots() {
                guard sectionForSlot(day: day, globalSlot: slot) == parsed.section else { continue }
                if ex.name == parsed.exercise.name,
                   ex.sets == parsed.exercise.sets,
                   ex.reps == parsed.exercise.reps,
                   (ex.notes ?? "") == (parsed.exercise.notes ?? "") {
                    return (planIndex: planIndex, globalSlot: slot)
                }
            }
        }

        // Pass 2 — name-only fallback (tolerates corrected sets/reps/notes).
        let parsedName = parsed.exercise.name.lowercased()
        for (planIndex, day) in matchingDays {
            for (slot, ex) in day.enumeratedExerciseSlots() {
                guard sectionForSlot(day: day, globalSlot: slot) == parsed.section else { continue }
                if ex.name.lowercased() == parsedName {
                    return (planIndex: planIndex, globalSlot: slot)
                }
            }
        }

        return nil
    }

    /// Derives the local calendar `yyyy-MM-dd` for a workout day given the Monday week-start.
    /// Mon=+0, Tue=+1, Wed=+2, Thu=+3, Fri=+4, Sat=+5, Sun=+6 (relative to Monday).
    /// Falls back to `fallbackUtcDate` (the UTC timestamp prefix) if parsing fails.
    public static func calendarDayKey(
        weekStartMonday: String,
        dayLabel: String,
        fallbackUtcDate: String
    ) -> String {
        let offsets: [String: Int] = [
            "monday": 0, "mon": 0,
            "tuesday": 1, "tue": 1,
            "wednesday": 2, "wed": 2,
            "thursday": 3, "thu": 3,
            "friday": 4, "fri": 4,
            "saturday": 5, "sat": 5,
            "sunday": 6, "sun": 6,
        ]
        let lower = dayLabel.lowercased()
        guard let offset = offsets.first(where: { lower.hasPrefix($0.key) })?.value,
              let monday = DateHelpers.date(from: weekStartMonday),
              let target = Calendar.current.date(byAdding: .day, value: offset, to: monday)
        else { return fallbackUtcDate }
        return DateHelpers.dateString(from: target)
    }

    private static func sectionForSlot(day: WorkoutDay, globalSlot: Int) -> String {
        let w = day.warmups?.count ?? 0
        let m = day.exercises.count
        if globalSlot < w { return "warmup" }
        if globalSlot < w + m { return "main" }
        return "finisher"
    }
}
