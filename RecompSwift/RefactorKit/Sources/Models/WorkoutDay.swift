import Foundation

public struct WorkoutExercise: Codable, Identifiable, Hashable, Sendable {
    public var id: String { name }
    public var name: String
    public var sets: String
    public var reps: String
    public var notes: String?

    public init(name: String, sets: String, reps: String, notes: String? = nil) {
        self.name = name
        self.sets = sets
        self.reps = reps
        self.notes = notes
    }

    /// Parsed set count for UI and local progress (`"4"`, `"3-5"`, **`3x10`** / **`3×12`** sets×reps, etc.). Clamped so
    /// bad imports do not render huge rows of tiles. The `x` branch avoids treating `3`+`10` as `31`.
    public var effectiveSetCount: Int {
        Self.parseSetCount(from: sets)
    }

    /// Rest duration in seconds parsed from `notes` (e.g. `"rest: 60s"`, `"90 sec rest"`). Defaults to 60.
    public var restSeconds: Int {
        Self.parseRestSeconds(from: notes)
    }

    /// Human-readable rest label from notes, e.g. `"60s"`, for display badges.
    public var restDisplayLabel: String? {
        Self.parseRestDisplayLabel(from: notes)
    }

    public static func parseRestSeconds(from notes: String?, defaultSeconds: Int = 60) -> Int {
        parseRestComponents(from: notes).map { toSeconds(value: $0.value, unit: $0.unit) } ?? defaultSeconds
    }

    public static func parseRestDisplayLabel(from notes: String?) -> String? {
        guard let parts = parseRestComponents(from: notes) else { return nil }
        if let unit = parts.unit, unit.hasPrefix("min") || unit == "m" {
            return "\(parts.value) min"
        }
        return "\(parts.value)s"
    }

    private static func parseRestComponents(from notes: String?) -> (value: Int, unit: String?)? {
        guard let notes = notes?.trimmingCharacters(in: .whitespacesAndNewlines), !notes.isEmpty else {
            return nil
        }
        let lowered = notes.lowercased()
        let patterns: [(String, Int)] = [
            (#"rest[:\s]+(\d+)(?:\s*[-–]\s*\d+)?\s*(sec(?:onds?)?|s|min(?:utes?)?|m)?"#, 1),
            (#"(\d+)(?:\s*[-–]\s*\d+)?\s*(sec(?:onds?)?|s|min(?:utes?)?|m)\s+rest"#, 1),
            (#"^(\d+)\s*s(?:ec(?:onds?)?)?$"#, 1),
        ]
        for (pattern, group) in patterns {
            if let value = firstCaptureInt(pattern: pattern, in: lowered, group: group) {
                let unit = captureGroup(pattern: pattern, in: lowered, group: group + 1)
                return (value, unit)
            }
        }
        return nil
    }

    private static func captureGroup(pattern: String, in string: String, group: Int) -> String? {
        guard let re = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return nil }
        let range = NSRange(string.startIndex..., in: string)
        guard let m = re.firstMatch(in: string, options: [], range: range),
              group < m.numberOfRanges,
              let r = Range(m.range(at: group), in: string) else { return nil }
        let raw = String(string[r]).trimmingCharacters(in: .whitespacesAndNewlines)
        return raw.isEmpty ? nil : raw
    }

    private static func toSeconds(value: Int, unit: String?) -> Int {
        guard let unit, !unit.isEmpty else { return value }
        if unit.hasPrefix("min") || unit == "m" { return value * 60 }
        return value
    }

    public static func parseSetCount(from raw: String, default defaultCount: Int = 3, maxSets: Int = 12) -> Int {
        let s = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !s.isEmpty else { return defaultCount }
        func clamp(_ n: Int) -> Int { min(max(n, 1), maxSets) }

        let lowered = s.lowercased()

        // Natural language: "3 sets of 10", "1 set of 20", "3setsof10" (spaces stripped in imports).
        if let n = firstCaptureInt(
            pattern: #"^\s*(\d+)\s*sets?\s*of\s*(\d+)"#,
            in: lowered,
            group: 1
        ) {
            return clamp(n)
        }

        // Sets × reps: `3x10`, `3 × 12`, `3 x 10 reps` — use a real `x`/`×` token, not `firstIndex(of: "x")`
        // (which could match an accidental `x` in longer strings after space removal).
        if let n = firstCaptureInt(
            pattern: #"(\d+)\s*[x×]\s*(\d+)"#,
            in: lowered,
            group: 1
        ) {
            return clamp(n)
        }

        let normalized = s.replacingOccurrences(of: "–", with: "-")
        let dashParts = normalized.split(separator: "-", omittingEmptySubsequences: true)
            .map { $0.trimmingCharacters(in: .whitespaces) }
        if dashParts.count >= 2,
           let a = Int(dashParts[0]) {
            let bDigits = dashParts[1].prefix(while: { $0.isNumber })
            if let b = Int(bDigits) {
                return clamp(max(a, b))
            }
        }

        if let n = Int(s) {
            return clamp(n)
        }

        var value = 0
        var scanner = Scanner(string: s)
        if scanner.scanInt(&value) {
            return clamp(value)
        }
        return defaultCount
    }

    /// First `(group)` integer capture for `pattern` in `string`, else `nil`.
    private static func firstCaptureInt(pattern: String, in string: String, group: Int) -> Int? {
        guard let re = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return nil }
        let range = NSRange(string.startIndex..., in: string)
        guard let m = re.firstMatch(in: string, options: [], range: range),
              group < m.numberOfRanges,
              let r = Range(m.range(at: group), in: string) else { return nil }
        return Int(string[r])
    }
}

public struct WorkoutDay: Codable, Identifiable, Hashable, Sendable {
    public var id: String { day }
    public var day: String
    public var focus: String
    public var warmups: [WorkoutExercise]?
    public var exercises: [WorkoutExercise]
    public var finishers: [WorkoutExercise]?

    public init(
        day: String,
        focus: String,
        warmups: [WorkoutExercise]?,
        exercises: [WorkoutExercise],
        finishers: [WorkoutExercise]?
    ) {
        self.day = day
        self.focus = focus
        self.warmups = warmups
        self.exercises = exercises
        self.finishers = finishers
    }

    public var allExercises: [WorkoutExercise] {
        (warmups ?? []) + exercises + (finishers ?? [])
    }

    /// Flat order matches web planner: warm-ups, main, finishers — used for stable progress slot ids.
    public func enumeratedExerciseSlots() -> [(globalSlot: Int, exercise: WorkoutExercise)] {
        var out: [(Int, WorkoutExercise)] = []
        var i = 0
        for ex in warmups ?? [] {
            out.append((i, ex))
            i += 1
        }
        for ex in exercises {
            out.append((i, ex))
            i += 1
        }
        for ex in finishers ?? [] {
            out.append((i, ex))
            i += 1
        }
        return out
    }

    public var exerciseSlotCount: Int { allExercises.count }
}
