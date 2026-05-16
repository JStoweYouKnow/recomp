import Foundation
import SwiftData
import Observation

@MainActor
@Observable
public final class PlanService {
    public private(set) var isGenerating = false
    public private(set) var isAdjusting = false

    private static let minReasonableTDEE = 1200.0
    private static let maxReasonableTDEE = 4500.0

    private let api: APIClient

    public init(api: APIClient = .shared) {
        self.api = api
    }

    public func generatePlan(profile: UserProfileDTO, context: ModelContext) async throws -> FitnessPlan {
        isGenerating = true
        defer { isGenerating = false }

        var requestProfile = profile

        // Match web behavior: only pass learned TDEE when confidence is high enough.
        if let model = highestConfidenceMetabolicModel(context: context), model.confidence >= 70 {
            requestProfile.learnedTDEE = clampTDEE(model.estimatedTDEE)
        } else if let cached = MetabolicModelStorage.load(), cached.confidence >= 70 {
            requestProfile.learnedTDEE = clampTDEE(cached.estimatedTDEE)
        }

        if let targets = MeasurementTargetsStorage.load() {
            let hasAnyTarget = targets.targetWeightLbs != nil || targets.targetBodyFatPercent != nil || targets.targetMuscleMassLbs != nil
            if hasAnyTarget {
                requestProfile.measurementTargets = MeasurementTargetsDTO(
                    targetWeightLbs: targets.targetWeightLbs,
                    targetBodyFatPercent: targets.targetBodyFatPercent,
                    targetMuscleMassLbs: targets.targetMuscleMassLbs
                )
            }
        }

        let latestComposition = latestBodyComposition(context: context)
        requestProfile.currentBodyFatPercent = latestComposition.currentBodyFatPercent
        requestProfile.currentMuscleMassLbs = latestComposition.currentMuscleMassLbs

        let dto: FitnessPlanDTO = try await api.request(PlanAPI.generate(profile: requestProfile))
        let plan = mapPlan(dto)
        context.insert(plan)
        try? context.save()
        return plan
    }

    public func adjustPlan(feedback: String, currentPlan: FitnessPlanDTO?) async throws -> AdjustSuggestion {
        isAdjusting = true
        defer { isAdjusting = false }

        let response: AdjustResponse = try await api.request(
            PlanAPI.adjust(feedback: feedback, currentPlan: currentPlan)
        )
        return response.suggestion
    }

    /// Returns today's macro target — training targets on workout days, rest targets on rest days, falling back to `dailyTargets`.
    public func todaysTargets(context: ModelContext) -> Macros {
        let fallback = Macros(calories: 2000, protein: 150, carbs: 200, fat: 65)
        guard let plan = currentPlan(context: context) else { return fallback }
        if let workout = todaysWorkout(context: context) {
            let f = workout.focus.lowercased()
            let isRest = f.contains("rest") || f.contains("recovery") || f.contains("off")
            if isRest, let t = plan.dietPlan.restTargets, t.calories > 0 { return t }
            if !isRest, let t = plan.dietPlan.trainingTargets, t.calories > 0 { return t }
        } else {
            // No workout scheduled today — treat as rest day
            if let t = plan.dietPlan.restTargets, t.calories > 0 { return t }
        }
        let daily = plan.dietPlan.dailyTargets
        return daily.calories > 0 ? daily : fallback
    }

    /// Applies AI adjustment targets to the in-memory plan. Caller must `save` the `ModelContext` and trigger sync.
    public func applyAdjustSuggestion(_ suggestion: AdjustSuggestion, to plan: FitnessPlan) {
        if let targets = suggestion.newTargets {
            plan.dietPlan.dailyTargets = targets
            // Re-derive training/rest split from the new base
            let carbSwing: Double = 50
            plan.dietPlan.trainingTargets = Macros(
                calories: targets.calories + 200,
                protein: targets.protein,
                carbs: targets.carbs + carbSwing,
                fat: targets.fat
            )
            plan.dietPlan.restTargets = Macros(
                calories: targets.calories - 200,
                protein: targets.protein,
                carbs: max(0, targets.carbs - carbSwing),
                fat: targets.fat
            )
        }
        let note: String
        if let changes = suggestion.changes, !changes.isEmpty {
            note = changes.joined(separator: "; ")
        } else {
            note = suggestion.explanation
        }
        if let existing = plan.reasoning, !existing.isEmpty {
            plan.reasoning = existing + "\n\n[Adjusted] " + note
        } else {
            plan.reasoning = "[Adjusted] " + note
        }
        plan.synced = false
    }

    public func currentPlan(context: ModelContext) -> FitnessPlan? {
        let descriptor = FetchDescriptor<FitnessPlan>(
            sortBy: [SortDescriptor(\.createdAt, order: .reverse)]
        )
        return try? context.fetch(descriptor).first
    }

    public func todaysWorkout(context: ModelContext) -> WorkoutDay? {
        guard let plan = currentPlan(context: context) else { return nil }
        guard let idx = WorkoutProgramSchedule.planIndex(for: plan, date: .now) else { return nil }
        let weeklyPlan = plan.workoutPlan.weeklyPlan
        guard idx < weeklyPlan.count else { return nil }
        return weeklyPlan[idx]
    }

    /// `weeklyPlan` index for `todaysWorkout` (needed for scoped set progress keys).
    public func todaysWorkoutPlanIndex(context: ModelContext) -> Int? {
        guard let plan = currentPlan(context: context) else { return nil }
        guard let idx = WorkoutProgramSchedule.planIndex(for: plan, date: .now) else { return nil }
        guard idx < plan.workoutPlan.weeklyPlan.count else { return nil }
        return idx
    }

    private func mapPlan(_ dto: FitnessPlanDTO) -> FitnessPlan {
        FitnessPlan(
            id: dto.id,
            userId: dto.userId,
            dietPlan: DietPlan(
                dailyTargets: dto.dietPlan.dailyTargets,
                trainingTargets: dto.dietPlan.trainingTargets,
                restTargets: dto.dietPlan.restTargets,
                weeklyPlan: dto.dietPlan.weeklyPlan,
                tips: dto.dietPlan.tips
            ),
            workoutPlan: WorkoutPlan(
                weeklyPlan: dto.workoutPlan.weeklyPlan,
                tips: dto.workoutPlan.tips,
                programWeek1Start: dto.workoutPlan.programWeek1Start
            ),
            reasoning: dto.reasoning
        )
    }

    private func highestConfidenceMetabolicModel(context: ModelContext) -> MetabolicModel? {
        let models = (try? context.fetch(FetchDescriptor<MetabolicModel>())) ?? []
        return models.max(by: { $0.confidence < $1.confidence })
    }

    private func latestBodyComposition(context: ModelContext) -> (currentBodyFatPercent: Double?, currentMuscleMassLbs: Double?) {
        let rows = (try? context.fetch(FetchDescriptor<WearableDaySummary>())) ?? []
        if rows.isEmpty { return (nil, nil) }
        let sorted = rows.sorted { $0.date > $1.date }
        let bodyFat = sorted.first(where: { $0.bodyFatPercent != nil })?.bodyFatPercent
        let muscle = sorted.first(where: { $0.muscleMass != nil })?.muscleMass
        return (bodyFat, muscle)
    }

    private func clampTDEE(_ value: Double) -> Double {
        min(max(value, Self.minReasonableTDEE), Self.maxReasonableTDEE)
    }
}
