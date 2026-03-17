import Foundation

enum PlanAPI: APIEndpoint {
    case generate(profile: UserProfileDTO)
    case adjust(feedback: String, currentPlan: FitnessPlanDTO?)

    var path: String {
        switch self {
        case .generate: return "/api/plans/generate"
        case .adjust: return "/api/plans/adjust"
        }
    }

    var method: HTTPMethod { .POST }

    var body: (any Encodable)? {
        switch self {
        case .generate(let profile):
            return AnyEncodable(profile)
        case .adjust(let feedback, let currentPlan):
            return AnyEncodable(AdjustPayload(feedback: feedback, currentPlan: currentPlan))
        }
    }
}

struct AdjustPayload: Encodable {
    let feedback: String
    let currentPlan: FitnessPlanDTO?
}

struct FitnessPlanDTO: Codable, Sendable {
    var id: String
    var userId: String
    var createdAt: String
    var dietPlan: DietPlanDTO
    var workoutPlan: WorkoutPlanDTO
    var reasoning: String?

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

struct AdjustResponse: Decodable {
    let suggestion: AdjustSuggestion
}

struct AdjustSuggestion: Decodable {
    let newTargets: Macros?
    let explanation: String
    let changes: [String]?
}
