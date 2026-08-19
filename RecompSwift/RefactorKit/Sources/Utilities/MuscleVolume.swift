import Foundation

/// Weekly training volume per muscle group.
///
/// Hard sets per muscle per week is the strongest single predictor of hypertrophy, and it is
/// the number lifters most often get wrong — chest and biceps drift high while hamstrings,
/// rear delts, and calves quietly starve. This counts what was actually logged and scores it
/// against volume landmarks (MEV / MAV / MRV).
///
/// Port of web `src/lib/muscle-volume.ts`. Mirrored on Android in `api/MuscleVolume.kt`.
public enum MuscleVolume {

    // MARK: - Muscle groups

    public enum MuscleGroup: String, CaseIterable, Sendable {
        case chest, back, shoulders, biceps, triceps
        case quads, hamstrings, glutes, calves, abs, forearms, traps

        /// Human-readable label, e.g. `.hamstrings` → "Hamstrings".
        public var label: String { rawValue.prefix(1).uppercased() + rawValue.dropFirst() }
    }

    public struct Landmarks: Equatable, Sendable {
        public let mev: Int
        public let mav: Int
        public let mrv: Int
    }

    /// Weekly set landmarks per muscle group.
    ///
    /// - `mev` — minimum effective volume: below this, expect maintenance at best.
    /// - `mav` — maximum adaptive volume: the productive middle most growth happens in.
    /// - `mrv` — maximum recoverable volume: past this, fatigue outruns adaptation.
    public static let landmarks: [MuscleGroup: Landmarks] = [
        .chest: Landmarks(mev: 8, mav: 16, mrv: 22),
        .back: Landmarks(mev: 10, mav: 18, mrv: 25),
        .shoulders: Landmarks(mev: 8, mav: 18, mrv: 26),
        .biceps: Landmarks(mev: 8, mav: 16, mrv: 26),
        .triceps: Landmarks(mev: 6, mav: 14, mrv: 22),
        .quads: Landmarks(mev: 8, mav: 16, mrv: 20),
        .hamstrings: Landmarks(mev: 6, mav: 13, mrv: 20),
        .glutes: Landmarks(mev: 4, mav: 12, mrv: 16),
        .calves: Landmarks(mev: 8, mav: 16, mrv: 20),
        .abs: Landmarks(mev: 4, mav: 16, mrv: 25),
        .forearms: Landmarks(mev: 2, mav: 10, mrv: 16),
        .traps: Landmarks(mev: 4, mav: 12, mrv: 20),
    ]

    /// Beginners grow on less; advanced lifters need more before the same stimulus lands.
    private static let levelMultiplier: [String: Double] = [
        "beginner": 0.7,
        "intermediate": 1,
        "advanced": 1.15,
        "athlete": 1.15,
    ]

    /// A secondary mover earns half credit — the convention used for hard-set counting.
    private static let secondaryCredit = 0.5

    // MARK: - Classification

    /// ExerciseDB `targetMuscles` vocabulary → canonical groups. Unknown terms are dropped.
    private static let exerciseDBAliases: [String: MuscleGroup] = [
        "pectorals": .chest,
        "serratus anterior": .chest,
        "lats": .back,
        "upper back": .back,
        "levator scapulae": .back,
        "spine": .back,
        "delts": .shoulders,
        "deltoids": .shoulders,
        "biceps": .biceps,
        "triceps": .triceps,
        "quads": .quads,
        "quadriceps": .quads,
        "hamstrings": .hamstrings,
        "glutes": .glutes,
        "adductors": .quads,
        "abductors": .glutes,
        "calves": .calves,
        "abs": .abs,
        "forearms": .forearms,
        "traps": .traps,
    ]

    private struct NameRule {
        let tokens: [String]
        let primary: [MuscleGroup]
        let secondary: [MuscleGroup]
    }

    /// Name-based classification for untagged exercises — which is most of them, since plans
    /// are generated as free text. Ordered most specific first so "romanian deadlift" resolves
    /// to hamstrings before "deadlift" claims it for back.
    private static let nameRules: [NameRule] = [
        // Hinge / posterior chain — before generic deadlift
        NameRule(tokens: ["romanian", "rdl", "good morning", "stiff leg", "stiff-leg"], primary: [.hamstrings], secondary: [.glutes, .back]),
        NameRule(tokens: ["hip thrust", "glute bridge", "kickback"], primary: [.glutes], secondary: [.hamstrings]),
        NameRule(tokens: ["leg curl", "nordic", "ham curl"], primary: [.hamstrings], secondary: []),
        NameRule(tokens: ["deadlift"], primary: [.back, .hamstrings], secondary: [.glutes, .traps, .forearms]),

        // Squat pattern
        NameRule(tokens: ["leg press", "hack squat"], primary: [.quads], secondary: [.glutes]),
        NameRule(tokens: ["leg extension"], primary: [.quads], secondary: []),
        NameRule(tokens: ["lunge", "split squat", "step up", "step-up", "bulgarian"], primary: [.quads, .glutes], secondary: [.hamstrings]),
        NameRule(tokens: ["squat"], primary: [.quads], secondary: [.glutes, .hamstrings]),

        // Vertical / horizontal pull
        NameRule(tokens: ["pull up", "pull-up", "pullup", "chin up", "chin-up", "chinup", "pulldown"], primary: [.back], secondary: [.biceps]),
        NameRule(tokens: ["face pull", "rear delt", "reverse fly", "reverse flye"], primary: [.shoulders], secondary: [.back]),
        NameRule(tokens: ["row"], primary: [.back], secondary: [.biceps, .traps]),
        NameRule(tokens: ["pullover"], primary: [.back], secondary: [.chest]),
        NameRule(tokens: ["shrug"], primary: [.traps], secondary: [.forearms]),

        // Press / push
        NameRule(tokens: ["overhead press", "shoulder press", "military press", "arnold press", "push press"], primary: [.shoulders], secondary: [.triceps]),
        NameRule(tokens: ["lateral raise", "side raise", "front raise"], primary: [.shoulders], secondary: []),
        NameRule(tokens: ["incline bench", "incline press", "incline dumbbell"], primary: [.chest], secondary: [.shoulders, .triceps]),
        NameRule(tokens: ["bench press", "chest press", "push up", "push-up", "pushup", "dip"], primary: [.chest], secondary: [.triceps, .shoulders]),
        NameRule(tokens: ["fly", "flye", "pec deck", "cable crossover"], primary: [.chest], secondary: []),

        // Arms
        NameRule(tokens: ["skullcrusher", "skull crusher", "pushdown", "tricep", "overhead extension"], primary: [.triceps], secondary: []),
        NameRule(tokens: ["hammer curl", "preacher curl", "bicep curl", "curl"], primary: [.biceps], secondary: [.forearms]),
        NameRule(tokens: ["wrist curl", "farmer", "grip"], primary: [.forearms], secondary: []),

        // Core / calves
        NameRule(tokens: ["calf", "calve"], primary: [.calves], secondary: []),
        NameRule(tokens: ["plank", "crunch", "sit up", "sit-up", "situp", "leg raise", "hanging", "russian twist", "ab wheel", "dead bug", "hollow"], primary: [.abs], secondary: []),
    ]

    public struct Attribution: Equatable, Sendable {
        public let primary: [MuscleGroup]
        public let secondary: [MuscleGroup]
    }

    /// Map tagged muscle strings (ExerciseDB vocabulary) onto canonical groups.
    public static func normalizeTaggedMuscles(_ muscles: [String]?) -> [MuscleGroup] {
        guard let muscles, !muscles.isEmpty else { return [] }
        var seen: [MuscleGroup] = []
        for raw in muscles {
            let key = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            let mapped = exerciseDBAliases[key] ?? MuscleGroup(rawValue: key)
            if let mapped, !seen.contains(mapped) { seen.append(mapped) }
        }
        return seen
    }

    /// Which muscles an exercise trains. Prefers tagged muscles; otherwise matches the name.
    /// Returns empty when nothing matches, so unknown movements are excluded rather than misattributed.
    public static func classify(exerciseName: String, taggedMuscles: [String]? = nil) -> Attribution {
        let tagged = normalizeTaggedMuscles(taggedMuscles)
        if let first = tagged.first {
            return Attribution(primary: [first], secondary: Array(tagged.dropFirst()))
        }

        let name = exerciseName.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !name.isEmpty else { return Attribution(primary: [], secondary: []) }

        for rule in nameRules where rule.tokens.contains(where: name.contains) {
            return Attribution(primary: rule.primary, secondary: rule.secondary)
        }
        return Attribution(primary: [], secondary: [])
    }

    // MARK: - Weekly volume

    public enum Status: String, Sendable { case under, optimal, high, over }

    public struct Entry: Sendable {
        public let muscle: MuscleGroup
        /// Hard sets, primary at full credit and secondary at half.
        public let sets: Double
        public let landmarks: Landmarks
        public let status: Status
        /// Sets to reach MEV; 0 when already at or above it.
        public let setsToMev: Int
    }

    public struct Summary: Sendable {
        public let weekStart: String
        public let entries: [Entry]
        /// Groups below MEV — the actionable list.
        public let underdosed: [MuscleGroup]
        /// Groups above MRV — recoverability risk.
        public let overdosed: [MuscleGroup]
        public let totalHardSets: Int
        /// Exercise names that could not be classified, so gaps are explainable.
        public let unclassifiedExercises: [String]
    }

    private static func scaled(_ l: Landmarks, fitnessLevel: String?) -> Landmarks {
        let multiplier = levelMultiplier[fitnessLevel ?? "intermediate"] ?? 1
        guard multiplier != 1 else { return l }
        return Landmarks(
            mev: Int((Double(l.mev) * multiplier).rounded()),
            mav: Int((Double(l.mav) * multiplier).rounded()),
            mrv: Int((Double(l.mrv) * multiplier).rounded())
        )
    }

    private static func status(sets: Double, landmarks l: Landmarks) -> Status {
        if sets < Double(l.mev) { return .under }
        if sets > Double(l.mrv) { return .over }
        if sets > Double(l.mav) { return .high }
        return .optimal
    }

    private static func makeEntries(
        totals: [MuscleGroup: Double],
        fitnessLevel: String?
    ) -> [Entry] {
        MuscleGroup.allCases.map { muscle in
            let sets = ((totals[muscle] ?? 0) * 2).rounded() / 2
            let l = scaled(landmarks[muscle] ?? Landmarks(mev: 0, mav: 0, mrv: 0), fitnessLevel: fitnessLevel)
            return Entry(
                muscle: muscle,
                sets: sets,
                landmarks: l,
                status: status(sets: sets, landmarks: l),
                setsToMev: max(0, Int((Double(l.mev) - sets).rounded(.up)))
            )
        }
    }

    /// Count hard sets per muscle across a 7-day window starting at `weekStart`.
    /// Warmup sets are excluded; a set counts once it has reps logged.
    public static func computeWeekly(
        setLogs: [WorkoutSetLogDTO],
        weekStart: String,
        fitnessLevel: String? = nil,
        muscleLookup: [String: [String]] = [:]
    ) -> Summary {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = .current

        guard let start = formatter.date(from: weekStart),
              let end = Calendar.current.date(byAdding: .day, value: 7, to: start) else {
            return Summary(
                weekStart: weekStart,
                entries: makeEntries(totals: [:], fitnessLevel: fitnessLevel),
                underdosed: [], overdosed: [], totalHardSets: 0, unclassifiedExercises: []
            )
        }

        var totals: [MuscleGroup: Double] = [:]
        var unclassified: [String] = []
        var totalHardSets = 0

        for log in setLogs {
            guard log.section != "warmup", let reps = log.reps, reps > 0 else { continue }
            guard let date = formatter.date(from: log.date), date >= start, date < end else { continue }

            totalHardSets += 1

            let key = log.exerciseName.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            let attribution = classify(exerciseName: log.exerciseName, taggedMuscles: muscleLookup[key])

            if attribution.primary.isEmpty {
                let name = log.exerciseName.trimmingCharacters(in: .whitespacesAndNewlines)
                if !unclassified.contains(name) { unclassified.append(name) }
                continue
            }
            for muscle in attribution.primary { totals[muscle, default: 0] += 1 }
            for muscle in attribution.secondary { totals[muscle, default: 0] += secondaryCredit }
        }

        let entries = makeEntries(totals: totals, fitnessLevel: fitnessLevel)
        return Summary(
            weekStart: weekStart,
            entries: entries,
            underdosed: entries.filter { $0.status == .under }.map(\.muscle),
            overdosed: entries.filter { $0.status == .over }.map(\.muscle),
            totalHardSets: totalHardSets,
            unclassifiedExercises: unclassified
        )
    }

    /// Planned weekly volume from the program itself, before anything is logged.
    /// Lets the app flag an unbalanced plan on day one rather than four weeks in.
    public static func computePlanned(
        exercisesByDay: [[WorkoutExercise]],
        fitnessLevel: String? = nil
    ) -> [Entry] {
        var totals: [MuscleGroup: Double] = [:]

        for day in exercisesByDay {
            for exercise in day {
                let setCount = Double(Progression.parseSetTarget(exercise.sets))
                let attribution = classify(exerciseName: exercise.name, taggedMuscles: exercise.muscles)
                for muscle in attribution.primary { totals[muscle, default: 0] += setCount }
                for muscle in attribution.secondary { totals[muscle, default: 0] += setCount * secondaryCredit }
            }
        }

        return makeEntries(totals: totals, fitnessLevel: fitnessLevel)
    }
}
