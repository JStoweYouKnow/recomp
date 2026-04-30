import Foundation

public enum PlanAPI: APIEndpoint {
    case generate(profile: UserProfileDTO)
    case adjust(feedback: String, currentPlan: FitnessPlanDTO?)

    public var path: String {
        switch self {
        case .generate: return "/api/plans/generate"
        case .adjust: return "/api/plans/adjust"
        }
    }

    public var method: HTTPMethod { .POST }

    public var body: (any Encodable)? {
        switch self {
        case .generate(let profile):
            return AnyEncodable(profile)
        case .adjust(let feedback, let currentPlan):
            return AnyEncodable(AdjustPayload(feedback: feedback, plan: currentPlan))
        }
    }
}

public struct AdjustPayload: Encodable {
    public let feedback: String
    public let plan: FitnessPlanDTO?
}

/// Top-level DTOs (not nested under `FitnessPlanDTO`) so `public` properties stay valid for module clients.
public struct PlanDietPlanDTO: Codable, Sendable {
    public var dailyTargets: Macros
    public var weeklyPlan: [DietDay]
    public var tips: [String]
}

public struct PlanWorkoutPlanDTO: Codable, Sendable {
    public var weeklyPlan: [WorkoutDay]
    public var tips: [String]
    public var programWeek1Start: String?
}

public struct FitnessPlanDTO: Codable, Sendable {
    public var id: String
    public var userId: String
    public var createdAt: String
    public var dietPlan: PlanDietPlanDTO
    public var workoutPlan: PlanWorkoutPlanDTO
    public var reasoning: String?
}

public struct AdjustResponse: Decodable {
    public let suggestion: AdjustSuggestion
}

public struct AdjustSuggestion: Decodable {
    public let newTargets: Macros?
    public let explanation: String
    public let changes: [String]?
}
