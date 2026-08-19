import Foundation
import Testing
@testable import RefactorKit

// Mirrors the outcome-badge section of `src/lib/milestones.test.ts`.

private func outcomeLog(
    _ date: String,
    _ exerciseName: String,
    _ setIndex: Int,
    _ weightLbs: Double,
    reps: Int = 8
) -> WorkoutSetLogDTO {
    WorkoutSetLogDTO(
        id: "\(date):\(exerciseName):\(setIndex)",
        date: date,
        planId: "plan-1",
        dayLabel: "Monday",
        section: "main",
        exerciseName: exerciseName,
        globalSlot: 0,
        setIndex: setIndex,
        weightLbs: weightLbs,
        reps: reps,
        loggedAt: "\(date)T18:00:00.000Z"
    )
}

/// Weigh-ins from `start` to `end` lbs across `days`.
private func outcomeWeighIns(
    _ start: Double,
    _ end: Double,
    days: Int = 60,
    bfStart: Double? = nil,
    bfEnd: Double? = nil
) -> [DietPhase.WeighIn] {
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM-dd"
    formatter.timeZone = .current
    let base = formatter.date(from: "2026-05-01")!

    var out: [DietPhase.WeighIn] = []
    for d in stride(from: 0, through: days, by: 3) {
        let day = Calendar.current.date(byAdding: .day, value: d, to: base)!
        var bodyFat: Double?
        if let bfStart, let bfEnd {
            bodyFat = bfStart + ((bfEnd - bfStart) * Double(d)) / Double(days)
        }
        out.append(
            DietPhase.WeighIn(
                date: formatter.string(from: day),
                weightLbs: start + ((end - start) * Double(d)) / Double(days),
                bodyFatPercent: bodyFat
            )
        )
    }
    return out
}

// MARK: - Strength

@Test func outcomes_firstPRRequiresBeatingTheFirstSession() {
    let single = OutcomeMilestones.evaluate(
        OutcomeMilestones.Input(setLogs: [outcomeLog("2026-05-01", "Bench Press", 0, 185)])
    )
    #expect(!single.newlyEarned.contains(.firstPR))

    let improved = OutcomeMilestones.evaluate(
        OutcomeMilestones.Input(setLogs: [
            outcomeLog("2026-05-01", "Bench Press", 0, 185),
            outcomeLog("2026-05-08", "Bench Press", 0, 195),
        ])
    )
    #expect(improved.newlyEarned.contains(.firstPR))
}

@Test func outcomes_strengthBadgesTierByPercentGain() {
    let result = OutcomeMilestones.evaluate(
        OutcomeMilestones.Input(setLogs: [
            outcomeLog("2026-05-01", "Bench Press", 0, 185),
            outcomeLog("2026-06-01", "Bench Press", 0, 205),
        ])
    )
    #expect(result.newlyEarned.contains(.strengthUp5))
    #expect(result.newlyEarned.contains(.strengthUp10))
    #expect(!result.newlyEarned.contains(.strengthUp25))
}

@Test func outcomes_tracksProgressTowardNextStrengthBadge() {
    let result = OutcomeMilestones.evaluate(
        OutcomeMilestones.Input(setLogs: [
            outcomeLog("2026-05-01", "Bench Press", 0, 200),
            outcomeLog("2026-06-01", "Bench Press", 0, 205),
        ])
    )
    let value = result.progress[MilestoneType.strengthUp5.rawValue] ?? 0
    #expect(value > 0)
    #expect(value < 100)
}

@Test func outcomes_consistencyAfterEightWeeks() {
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM-dd"
    formatter.timeZone = .current
    let base = formatter.date(from: "2026-05-04")!

    let logs = (0..<8).map { week -> WorkoutSetLogDTO in
        let day = Calendar.current.date(byAdding: .day, value: week * 7, to: base)!
        return outcomeLog(formatter.string(from: day), "Bench Press", 0, 185)
    }

    #expect(OutcomeMilestones.evaluate(OutcomeMilestones.Input(setLogs: logs)).newlyEarned.contains(.consistentLifter))
    #expect(!OutcomeMilestones.evaluate(OutcomeMilestones.Input(setLogs: Array(logs.prefix(5)))).newlyEarned.contains(.consistentLifter))
}

@Test func outcomes_deloadBadgeOnlyWhenCompleted() {
    #expect(OutcomeMilestones.evaluate(OutcomeMilestones.Input(completedDeload: true)).newlyEarned.contains(.deloadCompleted))
    #expect(!OutcomeMilestones.evaluate(OutcomeMilestones.Input()).newlyEarned.contains(.deloadCompleted))
}

// MARK: - Body composition

@Test func outcomes_weightLossTiersOffTheTrend() {
    let result = OutcomeMilestones.evaluate(OutcomeMilestones.Input(weighIns: outcomeWeighIns(220, 200)))
    #expect(result.newlyEarned.contains(.trendDown5))
    #expect(result.newlyEarned.contains(.trendDown15))
    #expect(!result.newlyEarned.contains(.trendDown30))
}

@Test func outcomes_noWeightLossBadgeForASingleLightDay() {
    let spiky = [
        DietPhase.WeighIn(date: "2026-05-01", weightLbs: 200),
        DietPhase.WeighIn(date: "2026-05-02", weightLbs: 200),
        DietPhase.WeighIn(date: "2026-05-03", weightLbs: 199),
        DietPhase.WeighIn(date: "2026-05-04", weightLbs: 188),
    ]
    #expect(!OutcomeMilestones.evaluate(OutcomeMilestones.Input(weighIns: spiky)).newlyEarned.contains(.trendDown5))
}

@Test func outcomes_bodyFatBadgesByPointsDropped() {
    let result = OutcomeMilestones.evaluate(
        OutcomeMilestones.Input(weighIns: outcomeWeighIns(200, 190, bfStart: 25, bfEnd: 22))
    )
    #expect(result.newlyEarned.contains(.bodyfatDown2))
    #expect(!result.newlyEarned.contains(.bodyfatDown5))
}

@Test func outcomes_leanMassGain() {
    let result = OutcomeMilestones.evaluate(
        OutcomeMilestones.Input(weighIns: outcomeWeighIns(180, 186, bfStart: 18, bfEnd: 15))
    )
    #expect(result.newlyEarned.contains(.leanMassGained))
}

@Test func outcomes_recompRequiresFatDownAndLeanUp() {
    let recomp = OutcomeMilestones.evaluate(
        OutcomeMilestones.Input(weighIns: outcomeWeighIns(200, 198, bfStart: 25, bfEnd: 20))
    )
    #expect(recomp.newlyEarned.contains(.recompAchieved))

    // Fat and lean both falling is a plain cut, not a recomp.
    let plainCut = OutcomeMilestones.evaluate(
        OutcomeMilestones.Input(weighIns: outcomeWeighIns(200, 188, bfStart: 25, bfEnd: 24.5))
    )
    #expect(!plainCut.newlyEarned.contains(.recompAchieved))
}

// MARK: - Award semantics

@Test func outcomes_neverReAwardsAnEarnedBadge() {
    let result = OutcomeMilestones.evaluate(
        OutcomeMilestones.Input(
            setLogs: [
                outcomeLog("2026-05-01", "Bench Press", 0, 185),
                outcomeLog("2026-06-01", "Bench Press", 0, 205),
            ],
            earned: [.firstPR, .strengthUp5, .strengthUp10]
        )
    )
    #expect(!result.newlyEarned.contains(.firstPR))
    #expect(!result.newlyEarned.contains(.strengthUp5))
}

@Test func outcomes_awardsNothingWithoutData() {
    #expect(OutcomeMilestones.evaluate(OutcomeMilestones.Input()).newlyEarned.isEmpty)
}

@Test func outcomes_milestoneTypeFlagsOutcomes() {
    #expect(MilestoneType.recompAchieved.isOutcome)
    #expect(!MilestoneType.firstMeal.isOutcome)
    #expect(MilestoneType.outcomeBadges.count == 14)
}

// MARK: - Deload completion

@Test func outcomes_deloadWeekCompletionDetection() {
    // Block length 5 anchored at 2026-05-04 → week 5 starts 2026-06-01.
    let anchor = "2026-05-04"

    #expect(OutcomeMilestones.hasCompletedDeloadWeek(
        anchorWeekStart: anchor, programWeekNow: 7, loggedWeekStarts: ["2026-06-01"], blockLength: 5
    ))
    #expect(!OutcomeMilestones.hasCompletedDeloadWeek(
        anchorWeekStart: anchor, programWeekNow: 7, loggedWeekStarts: ["2026-05-11", "2026-06-08"], blockLength: 5
    ))
    // Week 5 is the deload; it is not behind them yet.
    #expect(!OutcomeMilestones.hasCompletedDeloadWeek(
        anchorWeekStart: anchor, programWeekNow: 5, loggedWeekStarts: ["2026-06-01"], blockLength: 5
    ))
    // Second block's deload week starts 2026-07-06 (program week 10).
    #expect(OutcomeMilestones.hasCompletedDeloadWeek(
        anchorWeekStart: anchor, programWeekNow: 12, loggedWeekStarts: ["2026-07-06"], blockLength: 5
    ))
}
