import Foundation

struct WorkoutExercise: Codable, Identifiable, Hashable, Sendable {
    var id: String { name }
    var name: String
    var sets: String
    var reps: String
    var notes: String?
}

struct WorkoutDay: Codable, Identifiable, Hashable, Sendable {
    var id: String { day }
    var day: String
    var focus: String
    var warmups: [WorkoutExercise]?
    var exercises: [WorkoutExercise]
    var finishers: [WorkoutExercise]?

    var allExercises: [WorkoutExercise] {
        (warmups ?? []) + exercises + (finishers ?? [])
    }
}
