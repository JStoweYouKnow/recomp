import Foundation

public enum PlanAPI: APIEndpoint {
    case generate(profile: UserProfileDTO)
    case adjust(
        feedback: String,
        currentPlan: FitnessPlanDTO?,
        mealsThisWeek: [AdjustMealDTO],
        avgDailyCalories: Double?,
        avgDailyProtein: Double?
    )

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
        case .adjust(let feedback, let currentPlan, let mealsThisWeek, let avgDailyCalories, let avgDailyProtein):
            return AnyEncodable(
                AdjustPayload(
                    feedback: feedback,
                    plan: currentPlan,
                    mealsThisWeek: mealsThisWeek,
                    avgDailyCalories: avgDailyCalories,
                    avgDailyProtein: avgDailyProtein
                )
            )
        }
    }
}

public struct AdjustMealDTO: Encodable, Sendable {
    public let date: String
    public let name: String
    public let mealType: String
    public let calories: Double
    public let protein: Double
    public let carbs: Double
    public let fat: Double

    public init(date: String, name: String, mealType: String, calories: Double, protein: Double, carbs: Double, fat: Double) {
        self.date = date
        self.name = name
        self.mealType = mealType
        self.calories = calories
        self.protein = protein
        self.carbs = carbs
        self.fat = fat
    }
}

public struct AdjustPayload: Encodable {
    public let feedback: String
    public let plan: FitnessPlanDTO?
    public let mealsThisWeek: [AdjustMealDTO]
    public let avgDailyCalories: Double?
    public let avgDailyProtein: Double?
}

/// Top-level DTOs (not nested under `FitnessPlanDTO`) so `public` properties stay valid for module clients.
public struct PlanDietPlanDTO: Codable, Sendable {
    public var dailyTargets: Macros
    public var trainingTargets: Macros?
    public var restTargets: Macros?
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
