import Foundation

/// Deterministic progressive-overload engine.
///
/// Turns logged sets (weight/reps/RPE) into a strength trend per exercise and a concrete
/// prescription for the next session — "squat 195 x 5" rather than "try to go a bit heavier".
/// No model calls: every output is reproducible math, so the coach explains numbers instead
/// of inventing them.
///
/// Port of web `src/lib/progression.ts`. Mirrored on Android in `api/Progression.kt`.
/// Keep the three in sync — the tunables and branch order must match exactly.
public enum Progression {

    // MARK: - Tunables

    /// Reps beyond this make e1RM estimates unreliable; we flag low confidence.
    static let maxReliableReps = 12
    /// RPE at or below this on a top set means there was room to spare → earn load.
    static let overloadRPECeiling: Double = 8
    /// RPE at or above this means the set was a grind → hold rather than push.
    static let grindRPE: Double = 9.5
    /// Sessions without an e1RM improvement before we call it a stall.
    static let stallSessionThreshold = 3
    /// Load cut applied when deloading a stalled lift.
    static let deloadFraction: Double = 0.9
    /// Readiness score below this suppresses load increases.
    static let lowReadiness: Double = 60

    // MARK: - Types

    public struct RepRange: Equatable, Sendable {
        public let min: Int
        public let max: Int
    }

    public struct ExerciseSessionPoint: Equatable, Sendable {
        public let date: String
        /// Best estimated 1RM across all sets logged that session.
        public let bestE1rm: Double
        public let topSetWeightLbs: Double?
        public let topSetReps: Int?
        public let topSetRpe: Double?
        public let totalVolumeLbs: Double
        public let workingSets: Int
    }

    public enum Trend: String, Sendable {
        case climbing, flat, declining, insufficientData
    }

    public struct ExerciseProgression: Sendable {
        public let exerciseName: String
        /// Chronological, one entry per session that produced a usable e1RM.
        public let sessions: [ExerciseSessionPoint]
        public let currentE1rm: Double
        public let bestE1rm: Double
        public let bestE1rmDate: String?
        public let changePct: Double
        public let trend: Trend
        /// Sessions logged since the all-time best — the stall counter.
        public let sessionsSinceBest: Int
        public let stalled: Bool
    }

    public enum Action: String, Sendable {
        case establishBaseline, addLoad, addReps, hold, deload

        public var displayLabel: String {
            switch self {
            case .establishBaseline: return "Baseline"
            case .addLoad: return "Add load"
            case .addReps: return "Add reps"
            case .hold: return "Hold"
            case .deload: return "Deload"
            }
        }
    }

    public enum Confidence: String, Sendable { case high, medium, low }

    public struct Previous: Sendable {
        public let date: String
        public let weightLbs: Double?
        public let reps: Int?
        public let rpe: Double?
    }

    public struct SetPrescription: Sendable {
        public let exerciseName: String
        public let action: Action
        public let targetSets: Int
        public let targetReps: Int
        public let targetRepsMax: Int?
        public let targetWeightLbs: Double?
        public let targetRpe: Double?
        /// Human-readable "why", shown in the UI and handed to the coach verbatim.
        public let rationale: String
        public let confidence: Confidence
        public let previous: Previous?

        /// e.g. `"190 lb × 8"`, or nil for bodyweight/timed work.
        public var targetDisplay: String? {
            guard let weight = targetWeightLbs else { return nil }
            return "\(Progression.describeWeight(weight)) lb × \(targetReps)"
        }
    }

    public struct Options: Sendable {
        public var readinessScore: Double?
        /// Multiplier on prescribed load, e.g. 0.9 during a deload week. From `Mesocycle`.
        public var intensityMultiplier: Double
        /// Multiplier on prescribed sets, e.g. 0.5 during a deload week. From `Mesocycle`.
        public var volumeMultiplier: Double
        public var today: String?

        public init(
            readinessScore: Double? = nil,
            intensityMultiplier: Double = 1,
            volumeMultiplier: Double = 1,
            today: String? = nil
        ) {
            self.readinessScore = readinessScore
            self.intensityMultiplier = intensityMultiplier
            self.volumeMultiplier = volumeMultiplier
            self.today = today
        }
    }

    // MARK: - e1RM

    /// Epley estimated 1RM, RIR-adjusted when RPE is known.
    ///
    /// A set of 8 @ RPE 8 had ~2 reps in reserve, so it reflects the same strength as a set of
    /// 10 taken to failure. Folding that in makes submaximal work comparable across sessions.
    public static func estimateOneRepMax(weightLbs: Double, reps: Int, rpe: Double? = nil) -> Double {
        guard weightLbs > 0, reps > 0 else { return 0 }
        let repsInReserve: Double = {
            guard let rpe, rpe > 0, rpe <= 10 else { return 0 }
            return Swift.max(0, 10 - rpe)
        }()
        let effectiveReps = Double(reps) + repsInReserve
        return weightLbs * (1 + effectiveReps / 30)
    }

    /// Load that should permit `reps` at the given e1RM (inverse Epley).
    public static func loadForReps(e1rm: Double, reps: Int) -> Double {
        guard e1rm > 0, reps > 0 else { return 0 }
        return e1rm / (1 + Double(reps) / 30)
    }

    // MARK: - Parsing prescribed work

    /// `"8-12"` → 8...12; `"10"` → 10...10. Nil for time/AMRAP work.
    public static func parseRepRange(_ reps: String?) -> RepRange? {
        guard let reps else { return nil }
        let cleaned = reps.lowercased()
        for token in ["sec", "min", "amrap", "max", "failure"] where cleaned.contains(token) {
            return nil
        }
        let numbers = matchIntegers(in: cleaned)
        guard let first = numbers.first, first > 0 else { return nil }
        let second = numbers.count > 1 ? numbers[1] : first
        return RepRange(min: first, max: Swift.max(first, second))
    }

    /// `"3-4 sets"` / `"4"` → 4. Defaults to 3 when unparseable.
    public static func parseSetTarget(_ sets: String?) -> Int {
        guard let sets else { return 3 }
        let numbers = matchIntegers(in: sets)
        guard let last = numbers.last else { return 3 }
        return Swift.min(Swift.max(last, 1), 10)
    }

    private static func matchIntegers(in text: String) -> [Int] {
        var results: [Int] = []
        var current = ""
        for char in text {
            if char.isNumber {
                current.append(char)
            } else if !current.isEmpty {
                if let value = Int(current) { results.append(value) }
                current = ""
            }
        }
        if !current.isEmpty, let value = Int(current) { results.append(value) }
        return results
    }

    // MARK: - Load increments

    private static let lowerBodyTokens = [
        "squat", "deadlift", "leg press", "hip thrust", "lunge", "romanian", "rdl",
        "hack", "good morning", "split squat", "step-up", "step up", "calf",
    ]
    private static let dumbbellTokens = ["dumbbell", "db ", "kettlebell", "kb "]
    private static let isolationTokens = [
        "curl", "raise", "fly", "flye", "extension", "pushdown", "pullover",
        "shrug", "face pull", "rear delt", "kickback",
    ]

    /// Smallest sensible jump for this lift. Big compound lower-body movements absorb 10 lb;
    /// isolation work stalls out if you add more than 2.5.
    public static func loadIncrementLbs(exerciseName: String) -> Double {
        let name = exerciseName.lowercased()
        if isolationTokens.contains(where: name.contains) { return 2.5 }
        if dumbbellTokens.contains(where: name.contains) { return 5 }
        if lowerBodyTokens.contains(where: name.contains) { return 10 }
        return 5
    }

    /// Round to a loadable weight (2.5 lb granularity on the smallest jumps).
    public static func roundToLoadable(_ weightLbs: Double, incrementLbs: Double) -> Double {
        let granularity = incrementLbs <= 2.5 ? 2.5 : 5.0
        return (weightLbs / granularity).rounded() * granularity
    }

    static func describeWeight(_ weight: Double) -> String {
        weight == weight.rounded() ? String(Int(weight)) : String(format: "%.1f", weight)
    }

    // MARK: - Building the trend

    private static func normalize(_ name: String) -> String {
        name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    /// Collapse one exercise's logs into one point per session, keyed by date.
    public static func buildExerciseProgression(
        logs: [WorkoutSetLogDTO],
        exerciseName: String
    ) -> ExerciseProgression {
        let key = normalize(exerciseName)
        let relevant = logs.filter { normalize($0.exerciseName) == key && $0.section != "warmup" }

        var byDate: [String: [WorkoutSetLogDTO]] = [:]
        for log in relevant { byDate[log.date, default: []].append(log) }

        var sessions: [ExerciseSessionPoint] = []
        for (date, dayLogs) in byDate {
            var bestE1rm: Double = 0
            var topWeight: Double?
            var topReps: Int?
            var topRpe: Double?
            var volume: Double = 0
            var workingSets = 0

            for log in dayLogs {
                guard let weight = log.weightLbs, let reps = log.reps else { continue }
                workingSets += 1
                volume += weight * Double(reps)
                let e1rm = estimateOneRepMax(weightLbs: weight, reps: reps, rpe: log.rpe)
                if e1rm > bestE1rm {
                    bestE1rm = e1rm
                    topWeight = weight
                    topReps = reps
                    topRpe = log.rpe
                }
            }

            guard bestE1rm > 0 else { continue }
            sessions.append(
                ExerciseSessionPoint(
                    date: date,
                    bestE1rm: (bestE1rm * 10).rounded() / 10,
                    topSetWeightLbs: topWeight,
                    topSetReps: topReps,
                    topSetRpe: topRpe,
                    totalVolumeLbs: volume.rounded(),
                    workingSets: workingSets
                )
            )
        }

        sessions.sort { $0.date < $1.date }

        guard let last = sessions.last, let first = sessions.first else {
            return ExerciseProgression(
                exerciseName: exerciseName, sessions: [], currentE1rm: 0, bestE1rm: 0,
                bestE1rmDate: nil, changePct: 0, trend: .insufficientData,
                sessionsSinceBest: 0, stalled: false
            )
        }

        let currentE1rm = last.bestE1rm
        var bestE1rm: Double = 0
        var bestIndex = 0
        for (index, session) in sessions.enumerated() where session.bestE1rm > bestE1rm {
            bestE1rm = session.bestE1rm
            bestIndex = index
        }

        let changePct = first.bestE1rm > 0 ? ((currentE1rm - first.bestE1rm) / first.bestE1rm) * 100 : 0
        let sessionsSinceBest = sessions.count - 1 - bestIndex

        let trend: Trend = {
            if sessions.count < 2 { return .insufficientData }
            if changePct >= 2 { return .climbing }
            if changePct <= -3 { return .declining }
            return .flat
        }()

        return ExerciseProgression(
            exerciseName: relevant.first?.exerciseName ?? exerciseName,
            sessions: sessions,
            currentE1rm: currentE1rm,
            bestE1rm: bestE1rm,
            bestE1rmDate: sessions[bestIndex].date,
            changePct: (changePct * 10).rounded() / 10,
            trend: trend,
            sessionsSinceBest: sessionsSinceBest,
            stalled: sessionsSinceBest >= stallSessionThreshold
        )
    }

    /// One progression per distinct non-warmup exercise present in the logs.
    public static func buildAllProgressions(logs: [WorkoutSetLogDTO]) -> [ExerciseProgression] {
        var names: [String: String] = [:]
        for log in logs where log.section != "warmup" {
            let key = normalize(log.exerciseName)
            if !key.isEmpty, names[key] == nil { names[key] = log.exerciseName }
        }
        return names.values
            .map { buildExerciseProgression(logs: logs, exerciseName: $0) }
            .filter { !$0.sessions.isEmpty }
            .sorted { $0.currentE1rm > $1.currentE1rm }
    }

    // MARK: - Prescription

    /// Double progression with RPE autoregulation.
    ///
    /// Hit the top of the rep range with reps to spare → add load and reset to the bottom of
    /// the range. Otherwise add a rep. Grind sets hold, stalls deload.
    public static func prescribeNextSession(
        exercise: WorkoutExercise,
        progression: ExerciseProgression?,
        options: Options = Options()
    ) -> SetPrescription {
        // Never scale below one working set — a deload is less work, not no work.
        let targetSets = options.volumeMultiplier == 1
            ? parseSetTarget(exercise.sets)
            : Swift.max(1, Int((Double(parseSetTarget(exercise.sets)) * options.volumeMultiplier).rounded()))

        // Bodyweight / timed work has no load to prescribe.
        guard let range = parseRepRange(exercise.reps) else {
            return SetPrescription(
                exerciseName: exercise.name, action: .hold, targetSets: targetSets,
                targetReps: 0, targetRepsMax: nil, targetWeightLbs: nil, targetRpe: nil,
                rationale: "Perform as prescribed (\(exercise.reps)).",
                confidence: .low, previous: nil
            )
        }

        guard let progression, let last = progression.sessions.last,
              let lastWeight = last.topSetWeightLbs else {
            return SetPrescription(
                exerciseName: exercise.name, action: .establishBaseline, targetSets: targetSets,
                targetReps: range.min, targetRepsMax: range.max, targetWeightLbs: nil,
                targetRpe: overloadRPECeiling,
                rationale: "First tracked session — pick a weight you can take to \(range.max) reps at RPE \(Int(overloadRPECeiling)), then log it. That becomes your baseline.",
                confidence: .low, previous: nil
            )
        }

        let lastReps = last.topSetReps ?? 0
        let lastRpe = last.topSetRpe
        let increment = loadIncrementLbs(exerciseName: exercise.name)
        let previous = Previous(date: last.date, weightLbs: lastWeight, reps: lastReps, rpe: lastRpe)
        let confidence: Confidence = lastReps > maxReliableReps
            ? .low
            : (progression.sessions.count >= 3 ? .high : .medium)

        func applyMultiplier(_ weight: Double) -> Double {
            options.intensityMultiplier == 1
                ? weight
                : roundToLoadable(weight * options.intensityMultiplier, incrementLbs: increment)
        }

        // 1. Stalled → deload to break the plateau.
        if progression.stalled {
            let target = roundToLoadable(lastWeight * deloadFraction, incrementLbs: increment)
            return SetPrescription(
                exerciseName: exercise.name, action: .deload, targetSets: targetSets,
                targetReps: range.min, targetRepsMax: range.max,
                targetWeightLbs: applyMultiplier(target), targetRpe: 7,
                rationale: "No e1RM progress in \(progression.sessionsSinceBest) sessions. Drop to \(describeWeight(target)) lb (−10%) and rebuild — plateaus break by backing off, not grinding.",
                confidence: confidence, previous: previous
            )
        }

        // 2. Low readiness → hold load, keep the session productive but not costly.
        if let readiness = options.readinessScore, readiness < lowReadiness {
            return SetPrescription(
                exerciseName: exercise.name, action: .hold, targetSets: targetSets,
                targetReps: range.min, targetRepsMax: range.max,
                targetWeightLbs: applyMultiplier(lastWeight), targetRpe: 7,
                rationale: "Recovery is at \(Int(readiness.rounded()))/100. Repeat \(describeWeight(lastWeight)) lb and stop 2 reps shy — hold ground today, push when you're recovered.",
                confidence: confidence, previous: previous
            )
        }

        // 3. Last set was a grind → repeat it before adding anything.
        if let rpe = lastRpe, rpe >= grindRPE, lastReps < range.max {
            return SetPrescription(
                exerciseName: exercise.name, action: .hold, targetSets: targetSets,
                targetReps: Swift.min(lastReps + 1, range.max), targetRepsMax: range.max,
                targetWeightLbs: applyMultiplier(lastWeight), targetRpe: overloadRPECeiling + 1,
                rationale: "Last set hit RPE \(describeWeight(rpe)). Stay at \(describeWeight(lastWeight)) lb until it moves cleaner, then add load.",
                confidence: confidence, previous: previous
            )
        }

        // 4. Topped out the rep range with reps to spare → add load, reset reps.
        let earnedLoad = lastReps >= range.max && (lastRpe == nil || lastRpe! <= overloadRPECeiling)
        if earnedLoad {
            let target = roundToLoadable(lastWeight + increment, incrementLbs: increment)
            let rpeNote = lastRpe.map { " (RPE \(describeWeight($0)))" } ?? ""
            return SetPrescription(
                exerciseName: exercise.name, action: .addLoad, targetSets: targetSets,
                targetReps: range.min, targetRepsMax: range.max,
                targetWeightLbs: applyMultiplier(target), targetRpe: overloadRPECeiling,
                rationale: "You hit \(lastReps) reps at \(describeWeight(lastWeight)) lb\(rpeNote) — that earned the jump. Go \(describeWeight(target)) lb for \(range.min) and climb back up the range.",
                confidence: confidence, previous: previous
            )
        }

        // 5. Otherwise add a rep at the same load.
        let nextReps = Swift.min(lastReps + 1, range.max)
        return SetPrescription(
            exerciseName: exercise.name, action: .addReps, targetSets: targetSets,
            targetReps: nextReps, targetRepsMax: range.max,
            targetWeightLbs: applyMultiplier(lastWeight), targetRpe: overloadRPECeiling,
            rationale: "Last time: \(describeWeight(lastWeight)) lb × \(lastReps). Same weight, chase \(nextReps) reps. At \(range.max) you earn the next jump.",
            confidence: confidence, previous: previous
        )
    }

    /// Prescriptions for every main/finisher movement in a day, keyed by normalized name.
    public static func prescribeWorkoutDay(
        exercises: [WorkoutExercise],
        logs: [WorkoutSetLogDTO],
        options: Options = Options()
    ) -> [String: SetPrescription] {
        var result: [String: SetPrescription] = [:]
        for exercise in exercises {
            let key = normalize(exercise.name)
            guard !key.isEmpty, result[key] == nil else { continue }
            result[key] = prescribeNextSession(
                exercise: exercise,
                progression: buildExerciseProgression(logs: logs, exerciseName: exercise.name),
                options: options
            )
        }
        return result
    }

    // MARK: - Coach-facing summary

    public struct Summary: Sendable {
        public let trackedExercises: Int
        public let climbing: [String]
        public let stalled: [String]
        public let topGains: [(exerciseName: String, changePct: Double, currentE1rm: Double)]
        public let recentPrs: [(exerciseName: String, e1rm: Double, date: String)]
    }

    public static func summarize(
        _ progressions: [ExerciseProgression],
        recentDays: Int = 14,
        today: Date = Date()
    ) -> Summary {
        let cutoff = Calendar.current.date(byAdding: .day, value: -recentDays, to: today) ?? today
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = .current

        var climbing: [String] = []
        var stalled: [String] = []
        var recentPrs: [(exerciseName: String, e1rm: Double, date: String)] = []

        for progression in progressions {
            if progression.trend == .climbing { climbing.append(progression.exerciseName) }
            if progression.stalled { stalled.append(progression.exerciseName) }
            if let dateString = progression.bestE1rmDate,
               let date = formatter.date(from: dateString),
               date >= cutoff, progression.sessions.count > 1 {
                recentPrs.append((progression.exerciseName, progression.bestE1rm.rounded(), dateString))
            }
        }

        let topGains = progressions
            .filter { $0.sessions.count >= 2 }
            .sorted { $0.changePct > $1.changePct }
            .prefix(5)
            .map { (exerciseName: $0.exerciseName, changePct: $0.changePct, currentE1rm: $0.currentE1rm.rounded()) }

        return Summary(
            trackedExercises: progressions.count,
            climbing: climbing,
            stalled: stalled,
            topGains: Array(topGains),
            recentPrs: recentPrs.sorted { $0.date > $1.date }
        )
    }
}
