import Foundation
import Testing
@testable import RefactorKit

// Mirrors `src/lib/mesocycle.test.ts` — the engines must agree across platforms.

private func mesoLog(
    _ date: String,
    _ exerciseName: String,
    _ setIndex: Int,
    rpe: Double? = nil,
    weightLbs: Double = 185,
    reps: Int = 8,
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

private let noFatigue = Mesocycle.FatigueSignals()

// MARK: - Block position

@Test func mesocycle_clampsBlockLength() {
    #expect(Mesocycle.clampBlockLength(5) == 5)
    #expect(Mesocycle.clampBlockLength(1) == 3)
    #expect(Mesocycle.clampBlockLength(99) == 8)
    #expect(Mesocycle.clampBlockLength(nil) == Mesocycle.defaultBlockLength)
}

@Test func mesocycle_mapsWeeksOntoRepeatingBlocks() {
    #expect(Mesocycle.blockPosition(programWeek: 1, blockLength: 5) == (1, 1))
    #expect(Mesocycle.blockPosition(programWeek: 5, blockLength: 5) == (5, 1))
    #expect(Mesocycle.blockPosition(programWeek: 6, blockLength: 5) == (1, 2))
    #expect(Mesocycle.blockPosition(programWeek: 12, blockLength: 5) == (2, 3))
}

// MARK: - Phases

@Test func mesocycle_rampsVolumeAcrossAccumulation() {
    let w1 = Mesocycle.state(programWeek: 1, blockLength: 5)
    let w2 = Mesocycle.state(programWeek: 2, blockLength: 5)
    let w3 = Mesocycle.state(programWeek: 3, blockLength: 5)

    #expect(w1.phase == .accumulation)
    #expect(w1.volumeMultiplier == 0.85)
    #expect(w2.volumeMultiplier > w1.volumeMultiplier)
    #expect(w3.volumeMultiplier == 1.15)
    #expect(w3.intensityMultiplier == 1)
}

@Test func mesocycle_peaksSecondToLastWeek() {
    let peak = Mesocycle.state(programWeek: 4, blockLength: 5)
    #expect(peak.phase == .peak)
    #expect(peak.intensityMultiplier > 1)
    #expect(peak.volumeMultiplier == 1)
}

@Test func mesocycle_deloadsFinalWeek() {
    let deload = Mesocycle.state(programWeek: 5, blockLength: 5)
    #expect(deload.phase == .deload)
    #expect(deload.volumeMultiplier == 0.5)
    #expect(deload.intensityMultiplier == 0.9)
    #expect(deload.summary.contains("Deload"))
}

@Test func mesocycle_restartsOnNextBlock() {
    #expect(Mesocycle.state(programWeek: 6, blockLength: 5).phase == .accumulation)
    #expect(Mesocycle.state(programWeek: 6, blockLength: 5).blockNumber == 2)
    #expect(Mesocycle.state(programWeek: 10, blockLength: 5).phase == .deload)
}

@Test func mesocycle_shortBlocksHaveNoPeak() {
    #expect(Mesocycle.state(programWeek: 1, blockLength: 3).phase == .accumulation)
    #expect(Mesocycle.state(programWeek: 2, blockLength: 3).phase == .accumulation)
    #expect(Mesocycle.state(programWeek: 3, blockLength: 3).phase == .deload)
}

// MARK: - RPE creep

@Test func mesocycle_detectsRpeCreep() {
    let logs = [
        mesoLog("2026-06-24", "Bench Press", 0, rpe: 7),
        mesoLog("2026-06-26", "Bench Press", 1, rpe: 7),
        mesoLog("2026-07-01", "Bench Press", 0, rpe: 9),
        mesoLog("2026-07-03", "Bench Press", 1, rpe: 9),
    ]
    #expect(Mesocycle.rpeCreep(setLogs: logs, windowDays: 7, today: "2026-07-05") == 2)
}

@Test func mesocycle_rpeCreepZeroWithoutBothWindows() {
    #expect(Mesocycle.rpeCreep(setLogs: [mesoLog("2026-07-01", "Bench Press", 0, rpe: 8)], windowDays: 7, today: "2026-07-05") == 0)
    #expect(Mesocycle.rpeCreep(setLogs: [], windowDays: 7, today: "2026-07-05") == 0)
}

@Test func mesocycle_rpeCreepIgnoresWarmupsAndUnrated() {
    let logs = [
        mesoLog("2026-06-24", "Bench Press", 0, rpe: 7, section: "warmup"),
        mesoLog("2026-06-26", "Bench Press", 1),
        mesoLog("2026-07-01", "Bench Press", 0, rpe: 9),
    ]
    #expect(Mesocycle.rpeCreep(setLogs: logs, windowDays: 7, today: "2026-07-05") == 0)
}

// MARK: - Deload assessment

@Test func mesocycle_quietWhenNothingIsWrong() {
    let result = Mesocycle.assessDeloadNeed(noFatigue)
    #expect(!result.shouldDeload)
    #expect(result.urgency == .none)
    #expect(result.score == 0)
}

@Test func mesocycle_doesNotTrustASingleWeakSignal() {
    let result = Mesocycle.assessDeloadNeed(Mesocycle.FatigueSignals(stalledLifts: 1))
    #expect(!result.shouldDeload)
    #expect(result.urgency == .none)
}

@Test func mesocycle_callsDeloadWhenSignalsStack() {
    let result = Mesocycle.assessDeloadNeed(
        Mesocycle.FatigueSignals(stalledLifts: 2, rpeCreep: 0.6)
    )
    #expect(result.score == 55)
    #expect(result.urgency == .now)
    #expect(result.shouldDeload)
    #expect(result.reasons.count >= 2)
}

@Test func mesocycle_warnsBeforeInsisting() {
    let result = Mesocycle.assessDeloadNeed(Mesocycle.FatigueSignals(stalledLifts: 2))
    #expect(result.urgency == .soon)
    #expect(!result.shouldDeload)
}

@Test func mesocycle_countsRecoveryAndMissedSessions() {
    let result = Mesocycle.assessDeloadNeed(
        Mesocycle.FatigueSignals(musclesOverMrv: 2, readinessScore: 40, missedSessions: 2)
    )
    #expect(result.score == 55)
    #expect(result.shouldDeload)
}

@Test func mesocycle_doesNotRecommendDeloadDuringOne() {
    let result = Mesocycle.assessDeloadNeed(
        Mesocycle.FatigueSignals(stalledLifts: 3, rpeCreep: 1, musclesOverMrv: 3, missedSessions: 3),
        currentPhase: .deload
    )
    #expect(!result.shouldDeload)
    #expect(result.score == 0)
}

@Test func mesocycle_buildsSignalsFromLogs() {
    let stalledLogs = [
        mesoLog("2026-06-01", "Squat", 0, weightLbs: 300),
        mesoLog("2026-06-08", "Squat", 0, weightLbs: 290),
        mesoLog("2026-06-15", "Squat", 0, weightLbs: 290),
        mesoLog("2026-06-22", "Squat", 0, weightLbs: 285),
    ]
    let signals = Mesocycle.buildFatigueSignals(
        progressions: [Progression.buildExerciseProgression(logs: stalledLogs, exerciseName: "Squat")],
        setLogs: stalledLogs,
        musclesOverMrv: 1,
        readinessScore: 55,
        missedSessions: 1,
        today: "2026-06-23"
    )

    #expect(signals.stalledLifts == 1)
    #expect(signals.musclesOverMrv == 1)
    #expect(signals.readinessScore == 55)
    #expect(signals.missedSessions == 1)
}

// MARK: - Resolution

@Test func mesocycle_followsScheduleWhenFatigueIsLow() {
    let resolution = Mesocycle.resolve(programWeek: 2, blockLength: 5, signals: noFatigue)
    #expect(resolution.state.phase == .accumulation)
    #expect(!resolution.deloadForced)
}

@Test func mesocycle_pullsDeloadForwardWhenBodyAsks() {
    let resolution = Mesocycle.resolve(
        programWeek: 2,
        blockLength: 5,
        signals: Mesocycle.FatigueSignals(stalledLifts: 2, rpeCreep: 0.6, musclesOverMrv: 1)
    )
    #expect(resolution.deloadForced)
    #expect(resolution.state.phase == .deload)
    #expect(resolution.state.volumeMultiplier == 0.5)
    #expect(resolution.state.summary.contains("Early deload"))
    #expect(resolution.deload.urgency == .now)
}

@Test func mesocycle_worksWithoutSignals() {
    let resolution = Mesocycle.resolve(programWeek: 5, blockLength: 5)
    #expect(resolution.state.phase == .deload)
    #expect(resolution.deload.urgency == .none)
}

// MARK: - Drives the prescription

@Test func mesocycle_deloadHalvesSetsAndDropsLoad() {
    let bench = WorkoutExercise(name: "Bench Press", sets: "4", reps: "8-12")
    let history = [mesoLog("2026-07-01", "Bench Press", 0, rpe: 7, weightLbs: 200, reps: 12)]
    let progression = Progression.buildExerciseProgression(logs: history, exerciseName: "Bench Press")
    let deloadWeek = Mesocycle.state(programWeek: 5, blockLength: 5)

    let normal = Progression.prescribeNextSession(exercise: bench, progression: progression)
    let deloaded = Progression.prescribeNextSession(
        exercise: bench,
        progression: progression,
        options: Progression.Options(
            intensityMultiplier: deloadWeek.intensityMultiplier,
            volumeMultiplier: deloadWeek.volumeMultiplier
        )
    )

    #expect(normal.targetSets == 4)
    #expect(deloaded.targetSets == 2)
    #expect(deloaded.targetWeightLbs! < normal.targetWeightLbs!)
}

@Test func mesocycle_neverScalesBelowOneSet() {
    let single = WorkoutExercise(name: "Bench Press", sets: "1", reps: "8-12")
    let rx = Progression.prescribeNextSession(
        exercise: single,
        progression: nil,
        options: Progression.Options(volumeMultiplier: 0.5)
    )
    #expect(rx.targetSets == 1)
}

@Test func mesocycle_singleWeekPlansStillAdvance() {
    // effectiveProgramWeek pins these to 1 to keep weekday matching intact; the mesocycle
    // needs elapsed training time instead, or a repeating plan never reaches a deload.
    let plan = FitnessPlan(
        userId: "u1",
        createdAt: DateHelpers.date(from: "2026-06-01") ?? .now,
        dietPlan: DietPlan(dailyTargets: Macros(calories: 2000, protein: 150, carbs: 200, fat: 65), weeklyPlan: [], tips: []),
        workoutPlan: WorkoutPlan(
            weeklyPlan: [
                WorkoutDay(day: "Monday", focus: "Push", exercises: [WorkoutExercise(name: "Bench", sets: "3", reps: "10")]),
            ],
            tips: []
        )
    )

    #expect(WorkoutScheduleService.effectiveProgramWeek(
        for: plan,
        weekStartMonday: DateHelpers.mondayWeekStartString(containingCalendarDay: "2026-07-06"),
        today: "2026-07-06"
    ) == 1)
    #expect(WorkoutScheduleService.trainingWeeksElapsed(for: plan, today: "2026-06-01") == 1)
    #expect(WorkoutScheduleService.trainingWeeksElapsed(for: plan, today: "2026-06-08") == 2)
    #expect(WorkoutScheduleService.trainingWeeksElapsed(for: plan, today: "2026-07-06") == 6)

    // Week 5 of the block is the deload, so a repeating one-week plan gets one.
    #expect(Mesocycle.state(programWeek: 5, blockLength: 5).phase == .deload)
}

@Test func mesocycle_phaseLabels() {
    #expect(Mesocycle.Phase.accumulation.label == "Accumulation")
    #expect(Mesocycle.Phase.peak.label == "Peak")
    #expect(Mesocycle.Phase.deload.label == "Deload")
}
