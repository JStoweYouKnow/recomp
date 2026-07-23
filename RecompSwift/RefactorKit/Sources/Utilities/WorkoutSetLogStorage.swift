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
    public static func load() -> [WorkoutSetLogDTO] {
        guard let data = RecompAppGroupDefaults.shared.data(forKey: RecompUserDefaultsKeys.workoutSetLogsJSON),
              !data.isEmpty else { return [] }
        return (try? JSONDecoder().decode([WorkoutSetLogDTO].self, from: data)) ?? []
    }

    public static func save(_ logs: [WorkoutSetLogDTO]) {
        let trimmed = Array(logs.suffix(10_000))
        if let data = try? JSONEncoder().encode(trimmed) {
            RecompAppGroupDefaults.shared.set(data, forKey: RecompUserDefaultsKeys.workoutSetLogsJSON)
        }
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
