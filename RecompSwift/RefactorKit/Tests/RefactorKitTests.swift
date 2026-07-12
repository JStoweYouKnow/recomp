import Foundation
import Testing
import RefactorKit

@Test func workoutSchedule_detectsMissedSessions() async throws {
    let plan = FitnessPlan(
        userId: "u1",
        dietPlan: DietPlan(dailyTargets: Macros(calories: 2000, protein: 150, carbs: 200, fat: 65), weeklyPlan: [], tips: []),
        workoutPlan: WorkoutPlan(
            weeklyPlan: [
                WorkoutDay(day: "Monday", focus: "Push", exercises: [WorkoutExercise(name: "Bench", sets: "3", reps: "10")]),
            ],
            tips: []
        )
    )
    let missed = WorkoutScheduleService.detectMissedSessions(plan: plan, progress: [:], today: "2026-06-30", lookbackDays: 7)
    #expect(!missed.isEmpty)
}

@Test func workoutSchedule_stayOnWeekIncrementsOffset() async throws {
    var plan = FitnessPlan(
        userId: "u1",
        dietPlan: DietPlan(dailyTargets: Macros(calories: 2000, protein: 150, carbs: 200, fat: 65), weeklyPlan: [], tips: []),
        workoutPlan: WorkoutPlan(
            weeklyPlan: [WorkoutDay(day: "Monday — Week 1", focus: "Push", exercises: [WorkoutExercise(name: "A", sets: "3", reps: "10")])],
            tips: [],
            programWeek1Start: "2026-06-23",
            programWeekOffset: 0
        )
    )
    let result = WorkoutScheduleService.applyScheduleAction(plan: plan, action: .stayOnWeek, progress: [:], weeksMissed: 1)
    #expect(result.workoutPlan.programWeekOffset == 1)
}

@Test func workoutImportStart_anchorsSaturdayToNextMonday() async throws {
    let days = [
        WorkoutDay(day: "Monday — Week 1", focus: "A", exercises: [WorkoutExercise(name: "Squat", sets: "3", reps: "10")]),
        WorkoutDay(day: "Wednesday — Week 1", focus: "B", exercises: [WorkoutExercise(name: "Row", sets: "3", reps: "10")]),
    ]
    #expect(WorkoutImportStart.inferFirstSessionDate(weeklyPlan: days, today: "2026-07-11") == "2026-07-13")
    #expect(WorkoutImportStart.inferProgramWeek1Start(weeklyPlan: days, today: "2026-07-11") == "2026-07-13")
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
