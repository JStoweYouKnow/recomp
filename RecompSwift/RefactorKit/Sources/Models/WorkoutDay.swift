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
}

public struct WorkoutDay: Codable, Identifiable, Hashable, Sendable {
    public var id: String { day }
    public var day: String
    public var focus: String
    public var warmups: [WorkoutExercise]?
    public var exercises: [WorkoutExercise]
    public var finishers: [WorkoutExercise]?

    public var allExercises: [WorkoutExercise] {
        (warmups ?? []) + exercises + (finishers ?? [])
    }
}
