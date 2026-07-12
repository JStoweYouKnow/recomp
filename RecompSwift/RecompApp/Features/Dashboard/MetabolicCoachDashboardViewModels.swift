import Foundation
import SwiftData
import RefactorKit

/// Networking + data-assembly for `MetabolicModelDashboardCard`. The view passes in its
/// `@Query` results, `ModelContext`, profile weight, and `SyncEngine` so this type stays
/// free of SwiftUI environment capture. Display strings and the loading/error flags live here.
@MainActor
@Observable
final class MetabolicModelDashboardViewModel {
    private let planService = PlanService()

    var isUpdating = false
    var isApplyingTargets = false
    var errorText: String?
    var resultSummary: String?
    var appliedTargetsSummary: String?
    var unitDebugSummary: String?

    private static let minReasonableTDEE = 1200.0
    private static let maxReasonableTDEE = 4500.0

    /// Prefer SwiftData row from server sync (`fetchAndApply`), then on-device API cache — they can differ.
    func syncSummaryFromStores(metabolicModels: [MetabolicModel]) {
        if let m = metabolicModels.first, m.confidence >= 20 {
            let safeTDEE = clampTDEE(m.estimatedTDEE)
            resultSummary =
                "Last estimate: \(Int(safeTDEE)) kcal/day · \(Int(m.confidence))% confidence " +
                "(\(m.dataPoints.count) pts)"
            return
        }
        if let cached = MetabolicModelStorage.load(), cached.confidence >= 20 {
            let safeTDEE = clampTDEE(cached.estimatedTDEE)
            resultSummary =
                "Last estimate: \(Int(safeTDEE)) kcal/day · \(cached.confidence)% confidence " +
                "(\(cached.dataPointCount) pts)"
            return
        }
        resultSummary = nil
    }

    func refreshModel(
        context: ModelContext,
        meals: [MealEntry],
        wearables: [WearableDaySummary],
        profileWeight: Double?,
        syncEngine: SyncEngine?
    ) async {
        isUpdating = true
        errorText = nil
        defer { isUpdating = false }

        let plan = planService.currentPlan(context: context)
        let targets = plan?.dietPlan.dailyTargets ?? Macros(calories: 2000, protein: 150, carbs: 200, fat: 65)

        // Profile weight stored in lbs — convert to kg for the carry-forward starting point.
        let baseWeightKg = (profileWeight ?? 165) * 0.45359237

        // The server algorithm only uses weightKg + totalIntake — totalExpenditure is
        // stored in the data point struct but never read by the regression. Mirror the
        // web app's assembly: meals for intake, wearable weights in **lbs** → kg for the API (`weightKg`).
        var byDate: [String: (intake: Double, weightKg: Double?)] = [:]
        var wearableDaysWithWeight = 0
        for m in meals.prefix(600) {
            var cur = byDate[m.date] ?? (0, nil)
            cur.intake += Double(m.macros.calories)
            byDate[m.date] = cur
        }
        for w in wearables.prefix(200) {
            var cur = byDate[w.date] ?? (0, nil)
            if let lbs = w.weight {
                cur.weightKg = WearableMassStoredPounds.weightKg(fromStoredPounds: lbs)
                wearableDaysWithWeight += 1
            }
            byDate[w.date] = cur
        }
        unitDebugSummary = "Wearable weight: lbs → kg (\(wearableDaysWithWeight) day rows)."

        var prevWeight = baseWeightKg
        let sortedDates = byDate.keys.sorted()
        var points: [MetabolicDataPointPayload] = []
        for d in sortedDates {
            guard let row = byDate[d], row.intake > 0 else { continue }
            let wKg = row.weightKg ?? prevWeight
            if let w = row.weightKg { prevWeight = w }
            points.append(
                MetabolicDataPointPayload(
                    date: d,
                    weightKg: wKg,
                    totalIntake: row.intake,
                    totalExpenditure: Double(targets.calories)
                )
            )
        }

        guard points.count >= 7 else {
            errorText = "Need 7+ days with meals logged."
            return
        }

        do {
            let cachedHistory = MetabolicModelStorage.load()?.history ?? []
            let historyPayload = cachedHistory.map {
                MetabolicHistoryEntry(date: $0.date, tdee: $0.tdee, confidence: Double($0.confidence))
            }
            let payload = MetabolicBatchUpdatePayload(dataPoints: points, currentTDEE: targets.calories, history: historyPayload)
            let model: MetabolicModelResponse = try await APIClient.shared.request(MiscAPI.metabolicUpdate(payload: payload))
            let safeTDEE = clampTDEE(model.estimatedTDEE)
            let safeModel = MetabolicModelResponse(
                estimatedTDEE: safeTDEE,
                confidence: model.confidence,
                lastUpdated: model.lastUpdated,
                message: model.message,
                history: model.history
            )
            MetabolicModelStorage.save(safeModel, dataPointCount: points.count)
            upsertSwiftDataMetabolicModel(safeModel, points: points, context: context)
            if let msg = model.message, !msg.isEmpty {
                resultSummary =
                    "\(Int(safeTDEE)) kcal/day · \(model.confidence)% — \(msg)"
            } else {
                resultSummary =
                    "Estimated TDEE \(Int(safeTDEE)) kcal/day · \(model.confidence)% confidence"
            }
            await syncEngine?.markDirty()
        } catch {
            errorText = error.localizedDescription
        }
    }

    /// The TDEE estimate the card is currently showing — SwiftData row first, then the on-device cache.
    func currentEstimatedTDEE(metabolicModels: [MetabolicModel]) -> Double? {
        if let m = metabolicModels.first, m.confidence >= 20 {
            return clampTDEE(m.estimatedTDEE)
        }
        if let cached = MetabolicModelStorage.load(), cached.confidence >= 20 {
            return clampTDEE(cached.estimatedTDEE)
        }
        return nil
    }

    /// Recalculates macro targets from the suggested TDEE and writes them into the current plan.
    func applyToMacroTargets(
        context: ModelContext,
        metabolicModels: [MetabolicModel],
        profile: UserProfileDTO?,
        syncEngine: SyncEngine?
    ) async {
        guard let tdee = currentEstimatedTDEE(metabolicModels: metabolicModels) else {
            errorText = "Update the model first."
            return
        }
        guard let profile else {
            errorText = "Profile unavailable — sign in again."
            return
        }
        isApplyingTargets = true
        errorText = nil
        appliedTargetsSummary = nil
        defer { isApplyingTargets = false }
        do {
            guard let macros = try await planService.applyLearnedTDEEToTargets(tdee, profile: profile, context: context) else {
                errorText = "Generate a plan first."
                return
            }
            appliedTargetsSummary =
                "Targets updated: \(macros.calories) kcal · " +
                "P \(Int(macros.protein))g · C \(Int(macros.carbs))g · F \(Int(macros.fat))g"
            await syncEngine?.markDirty()
        } catch {
            errorText = error.localizedDescription
        }
    }

    private func upsertSwiftDataMetabolicModel(_ model: MetabolicModelResponse, points: [MetabolicDataPointPayload], context: ModelContext) {
        let iso8601 = ISO8601DateFormatter()
        let dataPoints = points.map {
            MetabolicDataPoint(date: $0.date, weightKg: $0.weightKg, totalIntake: $0.totalIntake, totalExpenditure: $0.totalExpenditure)
        }
        let history = model.history.map {
            MetabolicHistoryEntry(date: $0.date, tdee: $0.tdee, confidence: Double($0.confidence))
        }
        let lastUpdated = model.lastUpdated.flatMap { iso8601.date(from: $0) } ?? .now
        for x in (try? context.fetch(FetchDescriptor<MetabolicModel>())) ?? [] {
            context.delete(x)
        }
        context.insert(MetabolicModel(
            estimatedTDEE: model.estimatedTDEE,
            confidence: Double(model.confidence),
            dataPoints: dataPoints,
            lastUpdated: lastUpdated,
            history: history
        ))
        try? context.save()
    }

    private func clampTDEE(_ value: Double) -> Double {
        min(max(value, Self.minReasonableTDEE), Self.maxReasonableTDEE)
    }
}

/// Builds the coach check-in payload and calls the API for `CoachCheckInDashboardCard`.
/// The view passes its `@Query` arrays + `ModelContext` so derived signals (streak,
/// today's workout completion, today's meal count) are computed here, not in the view.
@MainActor
@Observable
final class CoachCheckInViewModel {
    private let mealService = MealService()
    private let planService = PlanService()

    var message: String?
    var tone: String?
    var loading = false

    func fetchCheckIn(
        profileName: String,
        context: ModelContext,
        biofeedbackEntries: [BiofeedbackEntry],
        allMeals: [MealEntry]
    ) async {
        loading = true
        defer { loading = false }
        let todayKey = DateHelpers.todayString()
        let targets = planService.todaysTargets(context: context)
        let todayMealCount = mealService.mealsForDate(todayKey, context: context).count
        let bioSnap: CoachBiofeedbackSnapshot? = latestTodayBio(biofeedbackEntries, todayKey: todayKey).map {
            CoachBiofeedbackSnapshot(
                energy: $0.energy,
                mood: $0.mood,
                hunger: $0.hunger,
                stress: $0.stress,
                soreness: $0.soreness
            )
        }
        let payload = CoachCheckInRequest(
            name: profileName,
            todayMeals: todayMealCount,
            todayTargets: targets,
            workoutCompleted: workoutCompletedToday(context: context, todayKey: todayKey),
            streak: mealLoggingStreak(allMeals),
            biofeedback: bioSnap
        )
        do {
            let res: CoachCheckInResponse = try await APIClient.shared.request(CoachAPI.checkIn(payload: payload))
            message = res.message ?? "Keep going — consistency wins."
            tone = res.tone ?? "encouraging"
        } catch {
            message = "Keep pushing! You've got this."
            tone = "encouraging"
        }
    }

    private func latestTodayBio(_ entries: [BiofeedbackEntry], todayKey: String) -> BiofeedbackEntry? {
        entries.first { $0.date == todayKey }
    }

    private func mealLoggingStreak(_ allMeals: [MealEntry]) -> Int {
        let dates = Set(allMeals.map(\.date))
        return DateHelpers.streakLength(dates: Array(dates))
    }

    private func workoutCompletedToday(context: ModelContext, todayKey: String) -> Bool {
        guard let plan = planService.currentPlan(context: context),
              let idx = planService.todaysWorkoutPlanIndex(context: context),
              let day = planService.todaysWorkout(context: context)
        else { return false }
        return WorkoutService.shared.isWorkoutDayFullyComplete(day, dayKey: todayKey, planIndex: idx, planId: plan.id)
    }
}
