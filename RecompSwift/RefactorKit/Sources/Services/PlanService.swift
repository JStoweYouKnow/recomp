import Foundation
import SwiftData
import Observation

@MainActor
@Observable
public final class PlanService {
    public private(set) var isGenerating = false
    public private(set) var isAdjusting = false

    private let api: APIClient

    public init(api: APIClient = .shared) {
        self.api = api
    }

    public func generatePlan(profile: UserProfileDTO, context: ModelContext) async throws -> FitnessPlan {
        isGenerating = true
        defer { isGenerating = false }

        let dto: FitnessPlanDTO = try await api.request(PlanAPI.generate(profile: profile))
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

    public func adjustSchedule(
        plan: FitnessPlan,
        action: ScheduleAction? = nil,
        progress: [String: String] = [:],
        useAiRecommendation: Bool = false
    ) async throws -> ScheduleAdjustResponse {
        isAdjusting = true
        defer { isAdjusting = false }

        let iso = ISO8601DateFormatter()
        let dto = FitnessPlanDTO(from: plan, iso8601: iso)
        return try await api.request(
            PlanAPI.adjustSchedule(
                payload: ScheduleAdjustPayload(
                    plan: dto,
                    action: action,
                    workoutProgress: progress.isEmpty ? nil : progress,
                    useAiRecommendation: useAiRecommendation,
                    today: DateHelpers.todayString()
                )
            )
        )
    }

    public func applyScheduleResponse(_ response: ScheduleAdjustResponse, to plan: FitnessPlan) {
        plan.workoutPlan.weeklyPlan = response.workoutPlan.weeklyPlan
        plan.workoutPlan.tips = response.workoutPlan.tips
        plan.workoutPlan.programWeek1Start = response.workoutPlan.programWeek1Start
        plan.workoutPlan.advancementMode = response.workoutPlan.advancementMode
        plan.workoutPlan.programWeekOffset = response.workoutPlan.programWeekOffset
        plan.workoutPlan.pausedUntil = response.workoutPlan.pausedUntil
        plan.workoutPlan.missedSessions = response.workoutPlan.missedSessions
        plan.workoutPlan.catchUpBannerDismissedAt = response.workoutPlan.catchUpBannerDismissedAt
        plan.synced = false
    }

    public func applyLocalScheduleAction(
        action: ScheduleAction,
        to plan: FitnessPlan,
        progress: [String: String]
    ) -> String {
        let result = WorkoutScheduleService.applyScheduleAction(
            plan: plan,
            action: action,
            progress: progress
        )
        plan.workoutPlan = result.workoutPlan
        plan.synced = false
        return result.summary
    }

    /// Applies AI adjustment targets to the in-memory plan. Caller must `save` the `ModelContext` and trigger sync.
    public func applyAdjustSuggestion(_ suggestion: AdjustSuggestion, to plan: FitnessPlan) {
        if let targets = suggestion.newTargets {
            plan.dietPlan.dailyTargets = targets
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
                weeklyPlan: dto.dietPlan.weeklyPlan,
                tips: dto.dietPlan.tips
            ),
            workoutPlan: WorkoutPlan(
                weeklyPlan: dto.workoutPlan.weeklyPlan,
                tips: dto.workoutPlan.tips,
                programWeek1Start: dto.workoutPlan.programWeek1Start,
                advancementMode: dto.workoutPlan.advancementMode,
                programWeekOffset: dto.workoutPlan.programWeekOffset,
                pausedUntil: dto.workoutPlan.pausedUntil,
                missedSessions: dto.workoutPlan.missedSessions,
                catchUpBannerDismissedAt: dto.workoutPlan.catchUpBannerDismissedAt
            ),
            reasoning: dto.reasoning
        )
    }
}
