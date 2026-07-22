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

@Test func workoutSchedule_dismissCatchUpBannerUsesLocalDatePrefix() async throws {
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
    let dismissed = WorkoutScheduleService.dismissCatchUpBanner(plan: plan, at: "2026-07-12T03:04:00.000Z")
    #expect(dismissed.workoutPlan.catchUpBannerDismissedAt?.hasPrefix("2026-07-12") == true)
    #expect(
        WorkoutScheduleService.shouldShowCatchUpBanner(
            plan: dismissed,
            progress: [:],
            today: "2026-07-12"
        ) == false
    )
}

@Test func workoutSchedule_hidesCatchUpBannerWhenTrackedSessionsCompleted() async throws {
    let plan = FitnessPlan(
        userId: "u1",
        dietPlan: DietPlan(dailyTargets: Macros(calories: 2000, protein: 150, carbs: 200, fat: 65), weeklyPlan: [], tips: []),
        workoutPlan: WorkoutPlan(
            weeklyPlan: [
                WorkoutDay(day: "Monday", focus: "Push", exercises: [WorkoutExercise(name: "Bench", sets: "3", reps: "10")]),
                WorkoutDay(day: "Wednesday", focus: "Pull", exercises: [WorkoutExercise(name: "Row", sets: "3", reps: "10")]),
            ],
            tips: [],
            missedSessions: [
                MissedSession(id: "0:2026-06-29", planIndex: 0, scheduledDate: "2026-06-29", status: .missed, dayLabel: "Monday", focus: "Push"),
                MissedSession(id: "1:2026-06-25", planIndex: 1, scheduledDate: "2026-06-25", status: .missed, dayLabel: "Wednesday", focus: "Pull"),
            ]
        )
    )
    let monday = plan.workoutPlan.weeklyPlan[0]
    let wednesday = plan.workoutPlan.weeklyPlan[1]
    let progress: [String: String] = [
        WorkoutWebProgress.legacyKey(planId: plan.id, dayLabel: monday.day, section: "main", exercise: monday.exercises[0]): "2026-06-29T18:00:00.000Z",
        WorkoutWebProgress.legacyKey(planId: plan.id, dayLabel: wednesday.day, section: "main", exercise: wednesday.exercises[0]): "2026-06-25T18:00:00.000Z",
    ]
    #expect(WorkoutScheduleService.shouldShowCatchUpBanner(plan: plan, progress: progress, today: "2026-06-30") == false)
}

@Test func workoutSchedule_ignoresStaleMissedSessionPlanIndex() async throws {
    let plan = FitnessPlan(
        userId: "u1",
        dietPlan: DietPlan(dailyTargets: Macros(calories: 2000, protein: 150, carbs: 200, fat: 65), weeklyPlan: [], tips: []),
        workoutPlan: WorkoutPlan(
            weeklyPlan: [
                WorkoutDay(day: "Monday", focus: "Push", exercises: [WorkoutExercise(name: "Bench", sets: "3", reps: "10")]),
            ],
            tips: [],
            missedSessions: [
                MissedSession(id: "99:2026-06-29", planIndex: 99, scheduledDate: "2026-06-29", status: .missed, dayLabel: "Monday", focus: "Push"),
            ]
        )
    )
    #expect(WorkoutScheduleService.countRecentMissed(plan: plan, progress: [:], today: "2026-06-30") == 0)
}

@Test func workoutSchedule_countsWeekScopedProgressAsComplete() async throws {
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
    let day = plan.workoutPlan.weeklyPlan[0]
    let scoped = WorkoutWebProgress.weekScopedKey(
        planId: plan.id,
        weekStartMondayYyyyMmDd: "2026-06-23",
        dayLabel: day.day,
        section: "main",
        exercise: day.exercises[0]
    )
    let progress = [scoped: "2026-06-29T18:00:00.000Z"]
    let missed = WorkoutScheduleService.detectMissedSessions(plan: plan, progress: progress, today: "2026-06-30", lookbackDays: 7)
    #expect(!missed.contains { $0.scheduledDate == "2026-06-29" })
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
