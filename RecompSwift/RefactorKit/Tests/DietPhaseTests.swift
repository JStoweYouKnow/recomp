import Foundation
import Testing
@testable import RefactorKit

// Mirrors `src/lib/diet-phase.test.ts` — the engines must agree across platforms.

/// Weigh-ins every `stepDays` days, changing by `deltaPerWeek` lbs per week.
private func weighInSeries(
    startWeight: Double,
    weeks: Int,
    deltaPerWeek: Double,
    stepDays: Int = 2,
    bodyFatStart: Double? = nil,
    bodyFatEnd: Double? = nil
) -> [DietPhase.WeighIn] {
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM-dd"
    formatter.timeZone = .current
    let start = formatter.date(from: "2026-05-01")!
    let totalDays = weeks * 7

    var out: [DietPhase.WeighIn] = []
    for day in stride(from: 0, through: totalDays, by: stepDays) {
        let date = Calendar.current.date(byAdding: .day, value: day, to: start)!
        let weight = startWeight + (deltaPerWeek * Double(day)) / 7
        var bodyFat: Double?
        if let bodyFatStart, let bodyFatEnd {
            let raw = bodyFatStart + ((bodyFatEnd - bodyFatStart) * Double(day)) / Double(totalDays)
            bodyFat = (raw * 10).rounded() / 10
        }
        out.append(
            DietPhase.WeighIn(
                date: formatter.string(from: date),
                weightLbs: (weight * 10).rounded() / 10,
                bodyFatPercent: bodyFat
            )
        )
    }
    return out
}

// MARK: - Trend

@Test func dietPhase_smoothsNoiseIntoATrend() {
    let noisy = [
        DietPhase.WeighIn(date: "2026-05-01", weightLbs: 200),
        DietPhase.WeighIn(date: "2026-05-02", weightLbs: 204), // water spike
        DietPhase.WeighIn(date: "2026-05-03", weightLbs: 199),
        DietPhase.WeighIn(date: "2026-05-04", weightLbs: 200),
        DietPhase.WeighIn(date: "2026-05-10", weightLbs: 198),
        DietPhase.WeighIn(date: "2026-05-15", weightLbs: 197),
    ]
    let trend = DietPhase.computeTrend(weighIns: noisy)

    #expect(trend.trendWeightLbs < 201)
    #expect(trend.trendWeightLbs > 197)
    #expect(trend.latestWeightLbs == 197)
    #expect(trend.reliable)
}

@Test func dietPhase_reportsRateAsLbsAndPercent() {
    let trend = DietPhase.computeTrend(weighIns: weighInSeries(startWeight: 200, weeks: 8, deltaPerWeek: -2))
    #expect(trend.weeklyChangeLbs < 0)
    #expect(trend.weeklyChangePct < 0)
}

@Test func dietPhase_unreliableWithoutEnoughData() {
    #expect(!DietPhase.computeTrend(weighIns: []).reliable)
    #expect(!DietPhase.computeTrend(weighIns: [DietPhase.WeighIn(date: "2026-05-01", weightLbs: 200)]).reliable)
    let shortSpan = [
        DietPhase.WeighIn(date: "2026-05-01", weightLbs: 200),
        DietPhase.WeighIn(date: "2026-05-02", weightLbs: 200),
        DietPhase.WeighIn(date: "2026-05-03", weightLbs: 199),
        DietPhase.WeighIn(date: "2026-05-04", weightLbs: 199),
    ]
    #expect(!DietPhase.computeTrend(weighIns: shortSpan).reliable)
}

@Test func dietPhase_ignoresEntriesWithoutWeight() {
    let trend = DietPhase.computeTrend(weighIns: [
        DietPhase.WeighIn(date: "2026-05-01", weightLbs: 200),
        DietPhase.WeighIn(date: "2026-05-05", weightLbs: nil),
        DietPhase.WeighIn(date: "2026-05-20", weightLbs: 196),
    ])
    #expect(trend.weighInCount == 2)
}

// MARK: - Lean mass

@Test func dietPhase_flagsLeanMassLoss() {
    let signal = DietPhase.computeLeanMassSignal(
        weighIns: weighInSeries(startWeight: 200, weeks: 6, deltaPerWeek: -1.67, stepDays: 3, bodyFatStart: 20, bodyFatEnd: 19.5)
    )!
    #expect(signal.leanChangeLbs < 0)
    #expect(signal.leanShareOfLoss > 0.25)
    #expect(signal.losingLeanMass)
}

@Test func dietPhase_quietWhenFatIsLeaving() {
    let signal = DietPhase.computeLeanMassSignal(
        weighIns: weighInSeries(startWeight: 200, weeks: 6, deltaPerWeek: -1.67, stepDays: 3, bodyFatStart: 25, bodyFatEnd: 20)
    )!
    #expect(!signal.losingLeanMass)
}

@Test func dietPhase_noLeanSignalWithoutBodyFat() {
    #expect(DietPhase.computeLeanMassSignal(weighIns: weighInSeries(startWeight: 200, weeks: 6, deltaPerWeek: -1.5)) == nil)
}

// MARK: - Cut

@Test func dietPhase_holdsAtProductiveRate() {
    let result = DietPhase.assess(
        goal: .loseWeight,
        weighIns: weighInSeries(startWeight: 200, weeks: 6, deltaPerWeek: -1.4),
        currentCalories: 2200
    )
    #expect(result.phase == .cut)
    #expect(result.rateVerdict == .onTrack)
    #expect(result.calorieAdjustment == 0)
}

@Test func dietPhase_addsCaloriesWhenCutIsTooAggressive() {
    let result = DietPhase.assess(
        goal: .loseWeight,
        weighIns: weighInSeries(startWeight: 200, weeks: 6, deltaPerWeek: -4),
        currentCalories: 2200
    )
    #expect(result.rateVerdict == .tooFast)
    #expect(result.calorieAdjustment > 0)
    #expect(result.details.joined(separator: " ").contains("muscle"))
}

@Test func dietPhase_trimsWhenLossIsTooSlow() {
    let result = DietPhase.assess(
        goal: .loseWeight,
        weighIns: weighInSeries(startWeight: 200, weeks: 6, deltaPerWeek: -0.4),
        currentCalories: 2200
    )
    #expect(result.rateVerdict == .tooSlow)
    #expect(result.calorieAdjustment < 0)
}

@Test func dietPhase_recognizesStallAndSuggestsBreak() {
    let result = DietPhase.assess(
        goal: .loseWeight,
        weighIns: weighInSeries(startWeight: 200, weeks: 5, deltaPerWeek: 0),
        currentCalories: 2200
    )
    #expect(result.rateVerdict == .stalled)
    #expect(result.calorieAdjustment < 0)
    #expect(result.suggestedPhase == .dietBreak)
}

@Test func dietPhase_callsDietBreakAfterLongDeficit() {
    let result = DietPhase.assess(
        goal: .loseWeight,
        weighIns: weighInSeries(startWeight: 200, weeks: 6, deltaPerWeek: -1.4),
        currentCalories: 2200,
        estimatedTDEE: 2700,
        weeksInDeficit: 14
    )
    #expect(result.dietBreakDue)
    #expect(result.suggestedPhase == .dietBreak)
    #expect(result.calorieAdjustment > 0)
    #expect(result.headline.contains("diet break"))
}

@Test func dietPhase_leanMassLossOverridesAcceptableRate() {
    let result = DietPhase.assess(
        goal: .loseWeight,
        weighIns: weighInSeries(startWeight: 200, weeks: 6, deltaPerWeek: -1.4, stepDays: 3, bodyFatStart: 20, bodyFatEnd: 19.5),
        currentCalories: 2200
    )
    #expect(result.leanMass?.losingLeanMass == true)
    #expect(result.details.first?.contains("lean mass") == true)
    #expect(result.calorieAdjustment > 0)
}

// MARK: - Lean bulk

@Test func dietPhase_holdsAtLeanBulkPace() {
    let result = DietPhase.assess(
        goal: .buildMuscle,
        weighIns: weighInSeries(startWeight: 180, weeks: 6, deltaPerWeek: 0.7),
        currentCalories: 3000
    )
    #expect(result.phase == .leanBulk)
    #expect(result.rateVerdict == .onTrack)
    #expect(result.calorieAdjustment == 0)
}

@Test func dietPhase_pullsBackWhenGainingTooFast() {
    let result = DietPhase.assess(
        goal: .buildMuscle,
        weighIns: weighInSeries(startWeight: 180, weeks: 6, deltaPerWeek: 2),
        currentCalories: 3400
    )
    #expect(result.rateVerdict == .tooFast)
    #expect(result.calorieAdjustment < 0)
}

@Test func dietPhase_addsCaloriesWhenBulkIsFlat() {
    let result = DietPhase.assess(
        goal: .buildMuscle,
        weighIns: weighInSeries(startWeight: 180, weeks: 6, deltaPerWeek: 0),
        currentCalories: 2800
    )
    #expect(result.rateVerdict == .stalled)
    #expect(result.calorieAdjustment > 0)
}

@Test func dietPhase_correctsAccidentalDeficit() {
    let result = DietPhase.assess(
        goal: .buildMuscle,
        weighIns: weighInSeries(startWeight: 180, weeks: 6, deltaPerWeek: -1),
        currentCalories: 2600
    )
    #expect(result.rateVerdict == .wrongDirection)
    #expect(result.calorieAdjustment > 0)
}

// MARK: - Maintenance

@Test func dietPhase_approvesFlatTrend() {
    let result = DietPhase.assess(
        goal: .maintain,
        weighIns: weighInSeries(startWeight: 180, weeks: 6, deltaPerWeek: 0.05),
        currentCalories: 2600
    )
    #expect(result.phase == .maintenance)
    #expect(result.rateVerdict == .onTrack)
    #expect(result.calorieAdjustment == 0)
}

@Test func dietPhase_correctsMaintenanceDrift() {
    let up = DietPhase.assess(
        goal: .maintain,
        weighIns: weighInSeries(startWeight: 180, weeks: 6, deltaPerWeek: 1),
        currentCalories: 2600
    )
    #expect(up.calorieAdjustment < 0)

    let down = DietPhase.assess(
        goal: .maintain,
        weighIns: weighInSeries(startWeight: 180, weeks: 6, deltaPerWeek: -1),
        currentCalories: 2600
    )
    #expect(down.calorieAdjustment > 0)
}

// MARK: - Guardrails

@Test func dietPhase_changesNothingOnThinData() {
    let result = DietPhase.assess(
        goal: .loseWeight,
        weighIns: [DietPhase.WeighIn(date: "2026-05-01", weightLbs: 200)],
        currentCalories: 2200
    )
    #expect(result.calorieAdjustment == 0)
    #expect(result.headline.contains("Not enough weigh-ins"))
}

@Test func dietPhase_surfacesDriftingTdeeWhenConfident() {
    let result = DietPhase.assess(
        goal: .loseWeight,
        weighIns: weighInSeries(startWeight: 200, weeks: 6, deltaPerWeek: -1.4),
        currentCalories: 2200,
        estimatedTDEE: 2800,
        tdeeConfidence: 70
    )
    #expect(result.details.joined(separator: " ").contains("2800"))
}

@Test func dietPhase_quietAboutTdeeWhenConfidenceIsLow() {
    let result = DietPhase.assess(
        goal: .loseWeight,
        weighIns: weighInSeries(startWeight: 200, weeks: 6, deltaPerWeek: -1.4),
        currentCalories: 2200,
        estimatedTDEE: 2800,
        tdeeConfidence: 20
    )
    #expect(!result.details.joined(separator: " ").contains("2800"))
}

@Test func dietPhase_labels() {
    #expect(DietPhase.Name.cut.label == "Cut")
    #expect(DietPhase.Name.dietBreak.label == "Diet break")
    #expect(DietPhase.Name.leanBulk.label == "Lean bulk")
    #expect(DietPhase.Name.maintenance.label == "Maintenance")
    #expect(DietPhase.Name.recomp.label == "Recomp")
}
