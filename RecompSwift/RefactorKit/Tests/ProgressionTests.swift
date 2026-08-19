import Foundation
import Testing
@testable import RefactorKit

// Mirrors `src/lib/progression.test.ts` — the two engines must agree exactly.

private func log(
    _ date: String,
    _ exerciseName: String,
    _ setIndex: Int,
    _ weightLbs: Double? = nil,
    _ reps: Int? = nil,
    _ rpe: Double? = nil,
    section: String = "main"
) -> WorkoutSetLogDTO {
    WorkoutSetLogDTO(
        id: "\(date):\(exerciseName):\(setIndex)",
        date: date,
        planId: "plan-1",
        dayLabel: "Monday",
        section: section,
        exerciseName: exerciseName,
        globalSlot: 0,
        setIndex: setIndex,
        weightLbs: weightLbs,
        reps: reps,
        rpe: rpe,
        loggedAt: "\(date)T18:00:00.000Z"
    )
}

private let benchPress = WorkoutExercise(name: "Bench Press", sets: "3", reps: "8-12")

// MARK: - e1RM

@Test func estimateOneRepMax_usesEpleyWithoutRPE() {
    #expect(abs(Progression.estimateOneRepMax(weightLbs: 200, reps: 5) - 233.33) < 0.1)
}

@Test func estimateOneRepMax_creditsRepsInReserve() {
    #expect(abs(Progression.estimateOneRepMax(weightLbs: 200, reps: 5, rpe: 8) - 246.67) < 0.1)
    // RPE 10 = to failure = plain Epley
    #expect(
        abs(
            Progression.estimateOneRepMax(weightLbs: 200, reps: 5, rpe: 10)
                - Progression.estimateOneRepMax(weightLbs: 200, reps: 5)
        ) < 0.001
    )
}

@Test func estimateOneRepMax_zeroForInvalidInput() {
    #expect(Progression.estimateOneRepMax(weightLbs: 0, reps: 5) == 0)
    #expect(Progression.estimateOneRepMax(weightLbs: 200, reps: 0) == 0)
}

@Test func loadForReps_invertsEpley() {
    let e1rm = Progression.estimateOneRepMax(weightLbs: 200, reps: 5)
    #expect(abs(Progression.loadForReps(e1rm: e1rm, reps: 5) - 200) < 0.001)
}

// MARK: - Parsing

@Test func parseRepRange_handlesRangesAndSingles() {
    #expect(Progression.parseRepRange("8-12") == Progression.RepRange(min: 8, max: 12))
    #expect(Progression.parseRepRange("10") == Progression.RepRange(min: 10, max: 10))
    #expect(Progression.parseRepRange("12 each side") == Progression.RepRange(min: 12, max: 12))
}

@Test func parseRepRange_nilForTimedWork() {
    #expect(Progression.parseRepRange("30 sec") == nil)
    #expect(Progression.parseRepRange("AMRAP") == nil)
    #expect(Progression.parseRepRange(nil) == nil)
}

@Test func parseSetTarget_defaultsSanely() {
    #expect(Progression.parseSetTarget("3") == 3)
    #expect(Progression.parseSetTarget("3-4 sets") == 4)
    #expect(Progression.parseSetTarget("nonsense") == 3)
}

// MARK: - Load increments

@Test func loadIncrement_scalesToMovement() {
    #expect(Progression.loadIncrementLbs(exerciseName: "Back Squat") == 10)
    #expect(Progression.loadIncrementLbs(exerciseName: "Romanian Deadlift") == 10)
    #expect(Progression.loadIncrementLbs(exerciseName: "Bench Press") == 5)
    #expect(Progression.loadIncrementLbs(exerciseName: "Dumbbell Shoulder Press") == 5)
    #expect(Progression.loadIncrementLbs(exerciseName: "Bicep Curl") == 2.5)
    #expect(Progression.loadIncrementLbs(exerciseName: "Lateral Raise") == 2.5)
}

@Test func roundToLoadable_snapsToPlates() {
    #expect(Progression.roundToLoadable(183, incrementLbs: 10) == 185)
    #expect(Progression.roundToLoadable(31.2, incrementLbs: 2.5) == 30)
}

// MARK: - Trend

@Test func buildProgression_collapsesSessionsAndTracksTrend() {
    let logs = [
        log("2026-07-01", "Bench Press", 0, 185, 8),
        log("2026-07-01", "Bench Press", 1, 185, 7),
        log("2026-07-08", "Bench Press", 0, 190, 8),
        log("2026-07-15", "Bench Press", 0, 195, 9),
    ]
    let p = Progression.buildExerciseProgression(logs: logs, exerciseName: "Bench Press")

    #expect(p.sessions.count == 3)
    #expect(p.sessions[0].topSetWeightLbs == 185)
    #expect(p.sessions[0].topSetReps == 8)
    #expect(p.trend == .climbing)
    #expect(p.changePct > 0)
    #expect(!p.stalled)
}

@Test func buildProgression_ignoresWarmups() {
    let logs = [
        log("2026-07-01", "Bench Press", 0, 500, 5, section: "warmup"),
        log("2026-07-01", "Bench Press", 1, 185, 8),
    ]
    let p = Progression.buildExerciseProgression(logs: logs, exerciseName: "Bench Press")
    #expect(p.sessions.count == 1)
    #expect(p.sessions[0].topSetWeightLbs == 185)
}

@Test func buildProgression_matchesNamesCaseInsensitively() {
    let logs = [log("2026-07-01", "bench press ", 0, 185, 8)]
    #expect(Progression.buildExerciseProgression(logs: logs, exerciseName: "Bench Press").sessions.count == 1)
}

@Test func buildProgression_flagsStallAfterThreeSessions() {
    let logs = [
        log("2026-07-01", "Bench Press", 0, 200, 8),
        log("2026-07-08", "Bench Press", 0, 195, 8),
        log("2026-07-15", "Bench Press", 0, 195, 8),
        log("2026-07-22", "Bench Press", 0, 190, 8),
    ]
    let p = Progression.buildExerciseProgression(logs: logs, exerciseName: "Bench Press")
    #expect(p.sessionsSinceBest == 3)
    #expect(p.stalled)
    #expect(p.trend == .declining)
}

@Test func buildProgression_insufficientDataWhenNothingUsable() {
    let p = Progression.buildExerciseProgression(
        logs: [log("2026-07-01", "Bench Press", 0)],
        exerciseName: "Bench Press"
    )
    #expect(p.trend == .insufficientData)
    #expect(p.sessions.isEmpty)
}

@Test func buildAllProgressions_onePerExercise() {
    let logs = [
        log("2026-07-01", "Bench Press", 0, 185, 8),
        log("2026-07-01", "Back Squat", 0, 275, 5),
    ]
    #expect(Progression.buildAllProgressions(logs: logs).count == 2)
}

// MARK: - Prescription

@Test func prescribe_baselineWithoutHistory() {
    let rx = Progression.prescribeNextSession(exercise: benchPress, progression: nil)
    #expect(rx.action == .establishBaseline)
    #expect(rx.targetWeightLbs == nil)
    #expect(rx.confidence == .low)
}

@Test func prescribe_addsLoadAfterToppingRange() {
    let logs = [
        log("2026-07-01", "Bench Press", 0, 185, 10, 7),
        log("2026-07-08", "Bench Press", 0, 185, 12, 8),
    ]
    let rx = Progression.prescribeNextSession(
        exercise: benchPress,
        progression: Progression.buildExerciseProgression(logs: logs, exerciseName: "Bench Press")
    )
    #expect(rx.action == .addLoad)
    #expect(rx.targetWeightLbs == 190)
    #expect(rx.targetReps == 8)
    #expect(rx.rationale.contains("190"))
}

@Test func prescribe_addsRepWhenShortOfRange() {
    let logs = [log("2026-07-08", "Bench Press", 0, 185, 9, 8)]
    let rx = Progression.prescribeNextSession(
        exercise: benchPress,
        progression: Progression.buildExerciseProgression(logs: logs, exerciseName: "Bench Press")
    )
    #expect(rx.action == .addReps)
    #expect(rx.targetWeightLbs == 185)
    #expect(rx.targetReps == 10)
}

@Test func prescribe_holdsAfterGrind() {
    let logs = [log("2026-07-08", "Bench Press", 0, 185, 9, 10)]
    let rx = Progression.prescribeNextSession(
        exercise: benchPress,
        progression: Progression.buildExerciseProgression(logs: logs, exerciseName: "Bench Press")
    )
    #expect(rx.action == .hold)
    #expect(rx.targetWeightLbs == 185)
    #expect(rx.rationale.contains("RPE 10"))
}

@Test func prescribe_noLoadJumpOnMaximalTopSet() {
    let logs = [log("2026-07-08", "Bench Press", 0, 185, 12, 10)]
    let rx = Progression.prescribeNextSession(
        exercise: benchPress,
        progression: Progression.buildExerciseProgression(logs: logs, exerciseName: "Bench Press")
    )
    #expect(rx.action != .addLoad)
}

@Test func prescribe_deloadsStalledLift() {
    let logs = [
        log("2026-07-01", "Back Squat", 0, 300, 5, 8),
        log("2026-07-08", "Back Squat", 0, 290, 5, 8),
        log("2026-07-15", "Back Squat", 0, 290, 5, 9),
        log("2026-07-22", "Back Squat", 0, 285, 5, 9),
    ]
    let squat = WorkoutExercise(name: "Back Squat", sets: "4", reps: "5-8")
    let rx = Progression.prescribeNextSession(
        exercise: squat,
        progression: Progression.buildExerciseProgression(logs: logs, exerciseName: "Back Squat")
    )
    #expect(rx.action == .deload)
    #expect(rx.targetWeightLbs == 255)
    #expect(rx.rationale.contains("plateau"))
}

@Test func prescribe_suppressesLoadWhenRecoveryLow() {
    let logs = [log("2026-07-08", "Bench Press", 0, 185, 12, 7)]
    let progression = Progression.buildExerciseProgression(logs: logs, exerciseName: "Bench Press")

    #expect(Progression.prescribeNextSession(exercise: benchPress, progression: progression).action == .addLoad)

    let tired = Progression.prescribeNextSession(
        exercise: benchPress,
        progression: progression,
        options: Progression.Options(readinessScore: 45)
    )
    #expect(tired.action == .hold)
    #expect(tired.targetWeightLbs == 185)
    #expect(tired.rationale.contains("45/100"))
}

@Test func prescribe_scalesByIntensityMultiplier() {
    let logs = [log("2026-07-08", "Bench Press", 0, 200, 9, 8)]
    let rx = Progression.prescribeNextSession(
        exercise: benchPress,
        progression: Progression.buildExerciseProgression(logs: logs, exerciseName: "Bench Press"),
        options: Progression.Options(intensityMultiplier: 0.9)
    )
    #expect(rx.targetWeightLbs == 180)
}

@Test func prescribe_skipsTimedWork() {
    let plank = WorkoutExercise(name: "Plank", sets: "3", reps: "45 sec")
    let rx = Progression.prescribeNextSession(exercise: plank, progression: nil)
    #expect(rx.action == .hold)
    #expect(rx.targetWeightLbs == nil)
}

@Test func prescribe_lowConfidenceOnHighReps() {
    let highRep = WorkoutExercise(name: "Leg Extension", sets: "3", reps: "15-20")
    let logs = [log("2026-07-08", "Leg Extension", 0, 90, 18, 8)]
    let rx = Progression.prescribeNextSession(
        exercise: highRep,
        progression: Progression.buildExerciseProgression(logs: logs, exerciseName: "Leg Extension")
    )
    #expect(rx.confidence == .low)
}

@Test func prescribeWorkoutDay_keysByNormalizedName() {
    let logs = [
        log("2026-07-08", "Bench Press", 0, 185, 12, 7),
        log("2026-07-08", "Bicep Curl", 0, 30, 12, 8),
    ]
    let day = [benchPress, WorkoutExercise(name: "Bicep Curl", sets: "3", reps: "10-12")]
    let rxs = Progression.prescribeWorkoutDay(exercises: day, logs: logs)

    #expect(rxs.count == 2)
    #expect(rxs["bench press"]?.targetWeightLbs == 190)
    #expect(rxs["bicep curl"]?.targetWeightLbs == 32.5)
}

@Test func summarize_separatesClimbingFromStalled() {
    let logs = [
        log("2026-07-01", "Bench Press", 0, 185, 8, 8),
        log("2026-07-08", "Bench Press", 0, 195, 8, 8),
        log("2026-06-01", "Back Squat", 0, 300, 5, 8),
        log("2026-06-08", "Back Squat", 0, 290, 5, 8),
        log("2026-06-15", "Back Squat", 0, 290, 5, 8),
        log("2026-06-22", "Back Squat", 0, 285, 5, 8),
    ]
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM-dd"
    let today = formatter.date(from: "2026-07-10")!

    let summary = Progression.summarize(Progression.buildAllProgressions(logs: logs), recentDays: 14, today: today)

    #expect(summary.trackedExercises == 2)
    #expect(summary.climbing.contains("Bench Press"))
    #expect(summary.stalled.contains("Back Squat"))
    #expect(summary.recentPrs.map(\.exerciseName) == ["Bench Press"])
    #expect(summary.topGains.first?.exerciseName == "Bench Press")
}
