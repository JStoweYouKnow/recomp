import Foundation

public enum PlanAPI: APIEndpoint {
    case generate(profile: UserProfileDTO)
    case generateWorkouts(GenerateWorkoutsRequest)
    case adjust(
        feedback: String,
        currentPlan: FitnessPlanDTO?,
        mealsThisWeek: [AdjustMealDTO],
        avgDailyCalories: Double?,
        avgDailyProtein: Double?
    )
    case adjustSchedule(payload: ScheduleAdjustPayload)

    public var path: String {
        switch self {
        case .generate: return "/api/plans/generate"
        case .generateWorkouts: return "/api/plans/generate-workouts"
        case .adjust: return "/api/plans/adjust"
        case .adjustSchedule: return "/api/plans/adjust-schedule"
        }
    }

    public var method: HTTPMethod { .POST }

    public var body: (any Encodable)? {
        switch self {
        case .generate(let profile):
            return AnyEncodable(profile)
        case .generateWorkouts(let payload):
            return AnyEncodable(payload)
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
        case .adjustSchedule(let payload):
            return AnyEncodable(payload)
        }
    }
}

public struct GenerateWorkoutsProfile: Encodable, Sendable {
    public let name: String
    public let goal: String
    public let fitnessLevel: String
    public let workoutLocation: String?
    public let workoutEquipment: [String]?
    public let injuriesOrLimitations: [String]?
    public let workoutDaysPerWeek: Int
}

public struct GenerateWorkoutsRequest: Encodable, Sendable {
    public let fromWeek: Int
    public let toWeek: Int
    public let programWeeks: Int
    public let workoutDaysPerWeek: Int
    public let week1Template: [WorkoutDay]
    public let reason: String?
    public let profile: GenerateWorkoutsProfile
}

public struct GenerateWorkoutsResponse: Decodable, Sendable {
    public let workoutDays: [WorkoutDay]
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
    public var advancementMode: AdvancementMode?
    public var programWeekOffset: Int?
    public var pausedUntil: String?
    public var missedSessions: [MissedSession]?
    public var catchUpBannerDismissedAt: String?
}

public struct ScheduleAdjustPayload: Encodable, Sendable {
    public let plan: FitnessPlanDTO
    public let action: ScheduleAction?
    public let workoutProgress: [String: String]?
    public let useAiRecommendation: Bool?
    public let today: String?
    public let planIndex: Int?
    public let scheduledDate: String?
    public let rescheduledTo: String?
    public let weeksMissed: Int?

    public init(
        plan: FitnessPlanDTO,
        action: ScheduleAction? = nil,
        workoutProgress: [String: String]? = nil,
        useAiRecommendation: Bool = false,
        today: String? = nil,
        planIndex: Int? = nil,
        scheduledDate: String? = nil,
        rescheduledTo: String? = nil,
        weeksMissed: Int? = nil
    ) {
        self.plan = plan
        self.action = action
        self.workoutProgress = workoutProgress
        self.useAiRecommendation = useAiRecommendation
        self.today = today
        self.planIndex = planIndex
        self.scheduledDate = scheduledDate
        self.rescheduledTo = rescheduledTo
        self.weeksMissed = weeksMissed
    }
}

public struct ScheduleAdjustResponse: Decodable, Sendable {
    public let action: ScheduleAction
    public let summary: String
    public let workoutPlan: PlanWorkoutPlanDTO
    public let addedMissed: [MissedSession]?
    public let missedCount: Int?
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
