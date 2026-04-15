import Foundation
import Testing
import RefactorKit

@Test func refactorKitExists() async throws {
    #expect(true)
}

@Test func parseSetCount_handlesSetsTimesReps() async throws {
    #expect(WorkoutExercise.parseSetCount(from: "3x10") == 3)
    #expect(WorkoutExercise.parseSetCount(from: "3x10reps") == 3)
    #expect(WorkoutExercise.parseSetCount(from: "3 x 12") == 3)
    #expect(WorkoutExercise.parseSetCount(from: "3×12") == 3)
    #expect(WorkoutExercise.parseSetCount(from: "4X8") == 4)
    #expect(WorkoutExercise.parseSetCount(from: "12x3") == 12)
}

@Test func parseSetCount_stillHandlesPlainAndRanges() async throws {
    #expect(WorkoutExercise.parseSetCount(from: "4") == 4)
    #expect(WorkoutExercise.parseSetCount(from: "3-5") == 5)
    #expect(WorkoutExercise.parseSetCount(from: "20") == 12) // clamped
}

@Test func parseSetCount_handlesSetsOfRepsPhrase() async throws {
    #expect(WorkoutExercise.parseSetCount(from: "3 sets of 10") == 3)
    #expect(WorkoutExercise.parseSetCount(from: "3 sets of 10 reps") == 3)
    #expect(WorkoutExercise.parseSetCount(from: "3setsof10") == 3)
    #expect(WorkoutExercise.parseSetCount(from: "1 set of 20") == 1)
    #expect(WorkoutExercise.parseSetCount(from: "10 sets of 3") == 10)
}
