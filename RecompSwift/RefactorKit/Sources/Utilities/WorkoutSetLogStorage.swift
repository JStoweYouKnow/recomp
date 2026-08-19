import Foundation

public struct WorkoutSetLogDTO: Codable, Sendable, Equatable {
    public let id: String
    public let date: String
    public let planId: String
    public let dayLabel: String
    public let section: String
    public let exerciseName: String
    public let globalSlot: Int
    public let setIndex: Int
    public let weightLbs: Double?
    public let reps: Int?
    public let rpe: Double?
    public let prescribedSets: String?
    public let prescribedReps: String?
    public let loggedAt: String

    public init(
        id: String,
        date: String,
        planId: String,
        dayLabel: String,
        section: String,
        exerciseName: String,
        globalSlot: Int,
        setIndex: Int,
        weightLbs: Double? = nil,
        reps: Int? = nil,
        rpe: Double? = nil,
        prescribedSets: String? = nil,
        prescribedReps: String? = nil,
        loggedAt: String
    ) {
        self.id = id
        self.date = date
        self.planId = planId
        self.dayLabel = dayLabel
        self.section = section
        self.exerciseName = exerciseName
        self.globalSlot = globalSlot
        self.setIndex = setIndex
        self.weightLbs = weightLbs
        self.reps = reps
        self.rpe = rpe
        self.prescribedSets = prescribedSets
        self.prescribedReps = prescribedReps
        self.loggedAt = loggedAt
    }
}

/// Persists synced per-set performance logs (mirrors web `localStorage` / Dynamo `WORKOUT_SET_LOGS`).
public enum WorkoutSetLogStorage {
    // MARK: - Decode cache
    //
    // `load()` is called from SwiftUI computed properties, which re-run on every body
    // evaluation. Decoding up to 10,000 `WorkoutSetLogDTO` values from JSON each time
    // cost tens of milliseconds on the main thread per call, several times per frame —
    // the main source of tab-switch hitching.
    //
    // The cache is keyed on the raw stored `Data`, so a write from any process (watch,
    // extension, sync pull) invalidates it automatically: comparing Data is a memcmp,
    // orders of magnitude cheaper than decoding it.

    private static let cacheLock = NSLock()
    nonisolated(unsafe) private static var cachedData: Data?
    nonisolated(unsafe) private static var cachedLogs: [WorkoutSetLogDTO] = []
    nonisolated(unsafe) private static var cachedGeneration: Int = 0

    /// Increments whenever the decoded set changes. Cheap to read, and safe to use as a
    /// SwiftUI `task(id:)` key so derived analytics recompute only on real changes
    /// rather than on every render.
    public static var generation: Int {
        cacheLock.lock()
        defer { cacheLock.unlock() }
        refreshLocked()
        return cachedGeneration
    }

    public static func load() -> [WorkoutSetLogDTO] {
        cacheLock.lock()
        defer { cacheLock.unlock() }
        refreshLocked()
        return cachedLogs
    }

    /// Caller must hold `cacheLock`.
    private static func refreshLocked() {
        let data = RecompAppGroupDefaults.shared.data(forKey: RecompUserDefaultsKeys.workoutSetLogsJSON)
        if data == cachedData { return }
        cachedData = data
        cachedGeneration &+= 1
        guard let data, !data.isEmpty else {
            cachedLogs = []
            return
        }
        cachedLogs = (try? JSONDecoder().decode([WorkoutSetLogDTO].self, from: data)) ?? []
    }

    public static func save(_ logs: [WorkoutSetLogDTO]) {
        let trimmed = Array(logs.suffix(10_000))
        guard let data = try? JSONEncoder().encode(trimmed) else { return }
        RecompAppGroupDefaults.shared.set(data, forKey: RecompUserDefaultsKeys.workoutSetLogsJSON)
        // Prime the cache from what we just wrote so the next read skips a decode.
        cacheLock.lock()
        cachedData = data
        cachedLogs = trimmed
        cachedGeneration &+= 1
        cacheLock.unlock()
    }

    public static func replaceFromServer(_ remote: [WorkoutSetLogDTO]) {
        save(merge(local: load(), remote: remote))
    }

    public static func upsert(_ entry: WorkoutSetLogDTO) {
        var logs = load()
        if let idx = logs.firstIndex(where: { $0.id == entry.id }) {
            logs[idx] = entry
        } else {
            logs.append(entry)
        }
        save(logs)
    }

    public static func remove(id: String) {
        save(load().filter { $0.id != id })
    }

    /// Most recently logged working weight for an exercise (by name), for prefilling the input.
    public static func lastWeight(forExercise name: String) -> Double? {
        let target = name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return load()
            .filter {
                $0.exerciseName.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == target
                    && ($0.weightLbs ?? 0) > 0
            }
            .max { $0.loggedAt < $1.loggedAt }?
            .weightLbs
    }

    /// All logs recorded for a given plan/day/date, for the post-workout summary.
    public static func logs(planId: String, dayLabel: String, date: String) -> [WorkoutSetLogDTO] {
        load().filter { $0.planId == planId && $0.dayLabel == dayLabel && $0.date == date }
    }

    /// The log already recorded for one specific set, so the UI can restore what the
    /// user typed instead of re-deriving it from the prescription.
    public static func log(id: String) -> WorkoutSetLogDTO? {
        load().first { $0.id == id }
    }

    /// Every set logged for one exercise on one date, ordered by set index.
    /// Backs per-set restore when a workout card is reopened mid-session.
    public static func logs(
        planId: String,
        date: String,
        dayLabel: String,
        section: String,
        exerciseName: String,
        globalSlot: Int
    ) -> [Int: WorkoutSetLogDTO] {
        let target = exerciseName.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let matching = load().filter {
            $0.planId == planId
                && $0.date == date
                && $0.dayLabel == dayLabel
                && $0.section == section
                && $0.globalSlot == globalSlot
                && $0.exerciseName.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == target
        }
        return Dictionary(matching.map { ($0.setIndex, $0) }, uniquingKeysWith: { $1 })
    }

    /// Weight and reps from the most recent session of this exercise, per set index.
    /// Prefilling from the matching set (rather than one weight for the whole exercise)
    /// is what makes top-set-plus-backoff and drop-set patterns one-tap to repeat.
    public static func lastSessionSets(forExercise name: String) -> [Int: (weightLbs: Double?, reps: Int?)] {
        let target = name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let matching = load().filter {
            $0.exerciseName.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == target
        }
        guard let latestDate = matching.map(\.date).max() else { return [:] }
        let lastSession = matching.filter { $0.date == latestDate }
        return Dictionary(
            lastSession.map { ($0.setIndex, (weightLbs: $0.weightLbs, reps: $0.reps)) },
            uniquingKeysWith: { $1 }
        )
    }

    public static func merge(local: [WorkoutSetLogDTO], remote: [WorkoutSetLogDTO]) -> [WorkoutSetLogDTO] {
        var byId: [String: WorkoutSetLogDTO] = [:]
        for log in remote { byId[log.id] = log }
        for log in local {
            if let existing = byId[log.id] {
                if log.loggedAt >= existing.loggedAt { byId[log.id] = log }
            } else {
                byId[log.id] = log
            }
        }
        return byId.values.sorted { $0.loggedAt < $1.loggedAt }
    }

    public static func logId(
        planId: String,
        date: String,
        dayLabel: String,
        section: String,
        exerciseName: String,
        globalSlot: Int,
        setIndex: Int
    ) -> String {
        let name = exerciseName.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return "\(planId):\(date):\(dayLabel):\(section):\(name):\(globalSlot):set_\(setIndex)"
    }

    public static func buildLog(
        planId: String,
        date: String,
        dayLabel: String,
        section: String,
        exercise: WorkoutExercise,
        globalSlot: Int,
        setIndex: Int,
        weightLbs: Double? = nil,
        reps: Int? = nil,
        rpe: Double? = nil
    ) -> WorkoutSetLogDTO {
        let id = logId(
            planId: planId,
            date: date,
            dayLabel: dayLabel,
            section: section,
            exerciseName: exercise.name,
            globalSlot: globalSlot,
            setIndex: setIndex
        )
        let iso = ISO8601DateFormatter().string(from: .now)
        return WorkoutSetLogDTO(
            id: id,
            date: date,
            planId: planId,
            dayLabel: dayLabel,
            section: section,
            exerciseName: exercise.name.trimmingCharacters(in: .whitespacesAndNewlines),
            globalSlot: globalSlot,
            setIndex: setIndex,
            weightLbs: weightLbs,
            reps: reps,
            rpe: rpe,
            prescribedSets: exercise.sets,
            prescribedReps: exercise.reps,
            loggedAt: iso
        )
    }
}
