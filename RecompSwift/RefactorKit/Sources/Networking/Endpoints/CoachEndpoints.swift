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
    public let reply: String
    /// Tool actions Rico returned — each entry is decoded best-effort so one malformed action does not break meal logging / chat.
    public let actions: [RicoAction]
    public let recipeSuggestions: [ScoredRecipeSuggestion]?
    public let recipeSaved: SavedRecipeDTO?

    enum CodingKeys: String, CodingKey {
        case reply, actions, recipeSuggestions, recipeSaved
    }

    private struct LooseRicoElement: Decodable {
        /// `nil` when the subtree does not match a known Rico action shape.
        let value: RicoAction?
        nonisolated init(from decoder: Decoder) throws {
            value = try? RicoAction(from: decoder)
        }
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        reply =
            (try c.decodeIfPresent(String.self, forKey: .reply)?.trimmingCharacters(in: .whitespacesAndNewlines))
                ?? ""

        guard c.contains(.actions) else {
            actions = []
            recipeSuggestions = try c.decodeIfPresent([ScoredRecipeSuggestion].self, forKey: .recipeSuggestions)
            recipeSaved = try c.decodeIfPresent(SavedRecipeDTO.self, forKey: .recipeSaved)
            return
        }
        var nested = try c.nestedUnkeyedContainer(forKey: .actions)
        var out: [RicoAction] = []
        while !nested.isAtEnd {
            let wrap = try nested.decode(LooseRicoElement.self)
            if let a = wrap.value { out.append(a) }
        }
        actions = out
        recipeSuggestions = try c.decodeIfPresent([ScoredRecipeSuggestion].self, forKey: .recipeSuggestions)
        recipeSaved = try c.decodeIfPresent(SavedRecipeDTO.self, forKey: .recipeSaved)
    }
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
    public let recentMeals: [RicoMealSummary]?
    public let todayMacros: RicoMacroSummary?
    public let macroTargets: RicoMacroSummary?
    public let remainingMacros: RicoMacroSummary?
    public let savedRecipeCount: Int?
    public let savedRecipeNames: [String]?
    public let savedRecipes: [SavedRecipeDTO]?
    public let bodyWeight: Double?
    public let completedWorkoutToday: CompletedSessionSummary?
    public let workoutHistory: WorkoutHistorySummary?
    public let nextWorkout: NextWorkoutPreview?

    public init(
        name: String? = nil,
        goal: String? = nil,
        streak: Int? = nil,
        mealsLogged: Int? = nil,
        workoutPlan: RicoWorkoutPlanPayload? = nil,
        equipment: [String]? = nil,
        injuries: [String]? = nil,
        dietaryRestrictions: [String]? = nil,
        recentMeals: [RicoMealSummary]? = nil,
        todayMacros: RicoMacroSummary? = nil,
        macroTargets: RicoMacroSummary? = nil,
        remainingMacros: RicoMacroSummary? = nil,
        savedRecipeCount: Int? = nil,
        savedRecipeNames: [String]? = nil,
        savedRecipes: [SavedRecipeDTO]? = nil,
        bodyWeight: Double? = nil,
        completedWorkoutToday: CompletedSessionSummary? = nil,
        workoutHistory: WorkoutHistorySummary? = nil,
        nextWorkout: NextWorkoutPreview? = nil
    ) {
        self.name = name
        self.goal = goal
        self.streak = streak
        self.mealsLogged = mealsLogged
        self.workoutPlan = workoutPlan
        self.equipment = equipment
        self.injuries = injuries
        self.dietaryRestrictions = dietaryRestrictions
        self.recentMeals = recentMeals
        self.todayMacros = todayMacros
        self.macroTargets = macroTargets
        self.remainingMacros = remainingMacros
        self.savedRecipeCount = savedRecipeCount
        self.savedRecipeNames = savedRecipeNames
        self.savedRecipes = savedRecipes
        self.bodyWeight = bodyWeight
        self.completedWorkoutToday = completedWorkoutToday
        self.workoutHistory = workoutHistory
        self.nextWorkout = nextWorkout
    }
}

public struct RicoMealSummary: Encodable, Sendable {
    public let name: String
    public let mealType: String
    public let calories: Double
    public let protein: Double
    public let carbs: Double
    public let fat: Double

    public init(name: String, mealType: String, calories: Double, protein: Double, carbs: Double, fat: Double) {
        self.name = name
        self.mealType = mealType
        self.calories = calories
        self.protein = protein
        self.carbs = carbs
        self.fat = fat
    }
}

public struct RicoMacroSummary: Encodable, Sendable {
    public let calories: Double
    public let protein: Double
    public let carbs: Double
    public let fat: Double

    public init(calories: Double, protein: Double, carbs: Double, fat: Double) {
        self.calories = calories
        self.protein = protein
        self.carbs = carbs
        self.fat = fat
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
    case regeneratePlan(RegeneratePlanPayload)
    case adjustProgramStart(AdjustProgramStartPayload)
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
        case "regenerate_plan":
            let payload = (try? container.decode(RegeneratePlanPayload.self, forKey: .payload)) ?? RegeneratePlanPayload()
            self = .regeneratePlan(payload)
        case "adjust_program_start":
            self = .adjustProgramStart(try container.decode(AdjustProgramStartPayload.self, forKey: .payload))
        default:
            self = .unknown(type)
        }
    }
}

public struct LogMealPayload: Decodable, Sendable {
    public let id: String?
    public let date: String?
    public let name: String
    public let calories: Double
    public let protein: Double
    public let carbs: Double
    public let fat: Double
    public let mealType: MealType?

    enum CodingKeys: String, CodingKey {
        case id, date, name, calories, protein, carbs, fat, mealType
    }

    /// Bedrock payloads can omit fields or use integers — keep meal logging resilient.
    nonisolated public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let rawId = try c.decodeIfPresent(String.self, forKey: .id)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        id = rawId.flatMap { $0.isEmpty ? nil : $0 }
        let rawDate = try c.decodeIfPresent(String.self, forKey: .date)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        date = rawDate.flatMap { $0.isEmpty ? nil : $0 }
        let rawName = try c.decodeIfPresent(String.self, forKey: .name)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        name = rawName.flatMap { $0.isEmpty ? nil : $0 } ?? "Meal"
        calories = Self.readDouble(c, key: .calories)
        protein = Self.readDouble(c, key: .protein)
        carbs = Self.readDouble(c, key: .carbs)
        fat = Self.readDouble(c, key: .fat)
        if let raw = try c.decodeIfPresent(String.self, forKey: .mealType),
           let parsed = MealType(rawValue: raw.lowercased()) {
            mealType = parsed
        } else {
            mealType = nil
        }
    }

    private nonisolated static func readDouble(
        _ c: KeyedDecodingContainer<CodingKeys>,
        key: CodingKeys
    ) -> Double {
        if let d = try? c.decodeIfPresent(Double.self, forKey: key) { return d }
        if let i = try? c.decodeIfPresent(Int.self, forKey: key) { return Double(i) }
        if let s = try? c.decodeIfPresent(String.self, forKey: key),
           let parsed = Double(s.trimmingCharacters(in: .whitespacesAndNewlines)) {
            return parsed
        }
        return 0
    }

    public var asMacros: Macros {
        Macros(calories: Int(calories.rounded()), protein: protein, carbs: carbs, fat: fat)
    }

    public var resolvedId: String {
        if let id, !id.isEmpty { return id }
        return UUID().uuidString
    }

    public var resolvedDate: String {
        if let date, !date.isEmpty { return date }
        return DateHelpers.todayString()
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

public struct AdjustProgramStartPayload: Decodable, Sendable {
    public let startDate: String
}

public struct RegeneratePlanPayload: Decodable, Sendable {
    public let reason: String?
    public let programWeeks: Int?
    public let workoutDaysPerWeek: Int?

    public init(reason: String? = nil, programWeeks: Int? = nil, workoutDaysPerWeek: Int? = nil) {
        self.reason = reason
        self.programWeeks = programWeeks
        self.workoutDaysPerWeek = workoutDaysPerWeek
    }
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
