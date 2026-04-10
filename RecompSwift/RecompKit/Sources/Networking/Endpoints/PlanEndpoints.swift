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
            return AnyEncodable(AdjustPayload(feedback: feedback, currentPlan: currentPlan))
        }
    }
}

public struct AdjustPayload: Encodable {
    let feedback: String
    let currentPlan: FitnessPlanDTO?
}

public struct FitnessPlanDTO: Codable, Sendable {
    public var id: String
    public var userId: String
    public var createdAt: String
    public var dietPlan: DietPlanDTO
    public var workoutPlan: WorkoutPlanDTO
    public var reasoning: String?

    struct DietPlanDTO: Codable, Sendable {
        var dailyTargets: Macros
        var weeklyPlan: [DietDay]
        var tips: [String]
    }

    struct WorkoutPlanDTO: Codable, Sendable {
        var weeklyPlan: [WorkoutDay]
        var tips: [String]
    }
}

public struct AdjustResponse: Decodable {
    let suggestion: AdjustSuggestion
}

public struct AdjustSuggestion: Decodable {
    let newTargets: Macros?
    let explanation: String
    let changes: [String]?
}
