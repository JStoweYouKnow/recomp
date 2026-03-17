import Foundation
import SwiftData

@MainActor
@Observable
final class PlanService {
    private(set) var isGenerating = false
    private(set) var isAdjusting = false

    private let api: APIClient

    init(api: APIClient = .shared) {
        self.api = api
    }

    func generatePlan(profile: UserProfileDTO, context: ModelContext) async throws -> FitnessPlan {
        isGenerating = true
        defer { isGenerating = false }

        let dto: FitnessPlanDTO = try await api.request(PlanAPI.generate(profile: profile))
        let plan = mapPlan(dto)
        context.insert(plan)
        try? context.save()
        return plan
    }

    func adjustPlan(feedback: String, currentPlan: FitnessPlanDTO?) async throws -> AdjustSuggestion {
        isAdjusting = true
        defer { isAdjusting = false }

        let response: AdjustResponse = try await api.request(
            PlanAPI.adjust(feedback: feedback, currentPlan: currentPlan)
        )
        return response.suggestion
    }

    func currentPlan(context: ModelContext) -> FitnessPlan? {
        let descriptor = FetchDescriptor<FitnessPlan>(
            sortBy: [SortDescriptor(\.createdAt, order: .reverse)]
        )
        return try? context.fetch(descriptor).first
    }

    func todaysWorkout(context: ModelContext) -> WorkoutDay? {
        guard let plan = currentPlan(context: context) else { return nil }
        let dayIndex = Calendar.current.component(.weekday, from: .now) - 1
        let weeklyPlan = plan.workoutPlan.weeklyPlan
        guard dayIndex < weeklyPlan.count else { return nil }
        return weeklyPlan[dayIndex]
    }

    private func mapPlan(_ dto: FitnessPlanDTO) -> FitnessPlan {
        FitnessPlan(
            id: dto.id,
            userId: dto.userId,
            dietPlan: DietPlan(
                dailyTargets: dto.dietPlan.dailyTargets,
                weeklyPlan: dto.dietPlan.weeklyPlan,
                tips: dto.dietPlan.tips
            ),
            workoutPlan: WorkoutPlan(
                weeklyPlan: dto.workoutPlan.weeklyPlan,
                tips: dto.workoutPlan.tips
            ),
            reasoning: dto.reasoning
        )
    }
}
