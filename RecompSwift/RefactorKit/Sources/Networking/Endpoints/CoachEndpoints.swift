import Foundation

public enum CoachAPI: APIEndpoint {
    case chat(message: String, history: [CoachMessageDTO], context: RicoContextPayload? = nil)
    case checkIn(payload: CoachCheckInRequest)
    case confront(payload: CoachConfrontRequest)

    public var path: String {
        switch self {
        case .chat: return "/api/rico"
        case .checkIn: return "/api/coach/check-in"
        case .confront: return "/api/coach/confront"
        }
    }

    public var method: HTTPMethod { .POST }

    public var body: (any Encodable)? {
        switch self {
        case .chat(let message, let history, let context):
            return AnyEncodable(CoachChatPayload(message: message, history: history, context: context))
        case .checkIn(let payload):
            return AnyEncodable(payload)
        case .confront(let payload):
            return AnyEncodable(payload)
        }
    }
}

public struct CoachChatPayload: Encodable {
    let message: String
    let history: [CoachMessageDTO]
    let context: RicoContextPayload?
}

public struct CoachMessageDTO: Codable, Sendable {
    let role: String
    let content: String
    let at: String?
}

public struct CoachChatResponse: Decodable {
    let reply: String
    let actions: [RicoAction]
}

// MARK: - Rico Context (sent with every chat request)

public struct RicoContextPayload: Encodable, Sendable {
    public let name: String?
    public let goal: String?
    public let streak: Int?
    public let mealsLogged: Int?
    public let workoutPlan: RicoWorkoutPlanPayload?
    public let equipment: [String]?
    public let injuries: [String]?
    public let dietaryRestrictions: [String]?

    public init(
        name: String? = nil,
        goal: String? = nil,
        streak: Int? = nil,
        mealsLogged: Int? = nil,
        workoutPlan: RicoWorkoutPlanPayload? = nil,
        equipment: [String]? = nil,
        injuries: [String]? = nil,
        dietaryRestrictions: [String]? = nil
    ) {
        self.name = name
        self.goal = goal
        self.streak = streak
        self.mealsLogged = mealsLogged
        self.workoutPlan = workoutPlan
        self.equipment = equipment
        self.injuries = injuries
        self.dietaryRestrictions = dietaryRestrictions
    }
}

public struct RicoWorkoutPlanPayload: Encodable, Sendable {
    public let weeklyPlan: [RicoWorkoutDayPayload]
}

public struct RicoWorkoutDayPayload: Encodable, Sendable {
    public let day: String
    public let focus: String
    public let warmups: [RicoExercisePayload]?
    public let exercises: [RicoExercisePayload]
    public let finishers: [RicoExercisePayload]?
}

public struct RicoExercisePayload: Encodable, Sendable {
    public let name: String
    public let sets: String
    public let reps: String
    public let notes: String?
}

// MARK: - Rico Actions (received from the API, applied locally)

public enum RicoAction: Decodable, Sendable {
    case logMeal(LogMealPayload)
    case updateMacros(UpdateMacrosPayload)
    case swapExercise(SwapExercisePayload)
    case addExercise(AddExercisePayload)
    case updateWorkoutDay(UpdateWorkoutDayPayload)
    case unknown(String)

    enum CodingKeys: String, CodingKey {
        case type, payload
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let type = try container.decode(String.self, forKey: .type)
        switch type {
        case "log_meal":
            self = .logMeal(try container.decode(LogMealPayload.self, forKey: .payload))
        case "update_macros":
            self = .updateMacros(try container.decode(UpdateMacrosPayload.self, forKey: .payload))
        case "swap_exercise":
            self = .swapExercise(try container.decode(SwapExercisePayload.self, forKey: .payload))
        case "add_exercise":
            self = .addExercise(try container.decode(AddExercisePayload.self, forKey: .payload))
        case "update_workout_day":
            self = .updateWorkoutDay(try container.decode(UpdateWorkoutDayPayload.self, forKey: .payload))
        default:
            self = .unknown(type)
        }
    }
}

public struct LogMealPayload: Decodable, Sendable {
    public let name: String
    public let calories: Double
    public let protein: Double
    public let carbs: Double
    public let fat: Double

    public var asMacros: Macros {
        Macros(calories: Int(calories.rounded()), protein: protein, carbs: carbs, fat: fat)
    }
}

public struct UpdateMacrosPayload: Decodable, Sendable {
    public let calories: Double
    public let protein: Double
    public let carbs: Double
    public let fat: Double

    public var asMacros: Macros {
        Macros(calories: Int(calories.rounded()), protein: protein, carbs: carbs, fat: fat)
    }
}

public struct SwapExercisePayload: Decodable, Sendable {
    public let day: String
    public let oldExerciseName: String
    public let newExerciseName: String
    public let newSets: String
    public let newReps: String
    public let newNotes: String?
    public let section: String?
}

public struct AddExercisePayload: Decodable, Sendable {
    public let day: String
    public let exerciseName: String
    public let sets: String
    public let reps: String
    public let notes: String?
    public let section: String?
}

public struct UpdateWorkoutDayPayload: Decodable, Sendable {
    public let day: String
    public let focus: String
    public let warmups: [ExerciseEntryPayload]?
    public let exercises: [ExerciseEntryPayload]?
    public let finishers: [ExerciseEntryPayload]?
}

public struct ExerciseEntryPayload: Decodable, Sendable {
    public let name: String
    public let sets: String
    public let reps: String
    public let notes: String?
}

public struct CoachCheckInRequest: Encodable, Sendable {
    public let name: String
    public let todayMeals: Int
    public let todayTargets: Macros
    public let workoutCompleted: Bool
    public let streak: Int
    public let biofeedback: CoachBiofeedbackSnapshot?

    public init(
        name: String,
        todayMeals: Int,
        todayTargets: Macros,
        workoutCompleted: Bool,
        streak: Int,
        biofeedback: CoachBiofeedbackSnapshot?
    ) {
        self.name = name
        self.todayMeals = todayMeals
        self.todayTargets = todayTargets
        self.workoutCompleted = workoutCompleted
        self.streak = streak
        self.biofeedback = biofeedback
    }
}

public struct CoachBiofeedbackSnapshot: Encodable, Sendable {
    public let energy: Int
    public let mood: Int
    public let hunger: Int
    public let stress: Int
    public let soreness: Int

    public init(energy: Int, mood: Int, hunger: Int, stress: Int, soreness: Int) {
        self.energy = energy
        self.mood = mood
        self.hunger = hunger
        self.stress = stress
        self.soreness = soreness
    }
}

public struct CoachCheckInResponse: Decodable, Sendable {
    public let message: String?
    public let tone: String?
}

public struct CoachConfrontRequest: Encodable, Sendable {
    public let name: String
    public let patterns: [String]

    public init(name: String, patterns: [String]) {
        self.name = name
        self.patterns = patterns
    }
}
