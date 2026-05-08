import Foundation

public enum PushAPI: APIEndpoint {
    case subscribeExpo(token: String)
    case unsubscribeExpo(token: String)
    case status

    public var path: String {
        switch self {
        case .subscribeExpo: return "/api/push/subscribe-expo"
        case .unsubscribeExpo: return "/api/push/unsubscribe-expo"
        case .status: return "/api/push/status"
        }
    }

    public var method: HTTPMethod {
        switch self {
        case .status: return .GET
        default: return .POST
        }
    }

    public var body: (any Encodable)? {
        switch self {
        case .subscribeExpo(let token): return AnyEncodable(["token": token])
        case .unsubscribeExpo(let token): return AnyEncodable(["token": token])
        default: return nil
        }
    }
}

public enum MiscAPI: APIEndpoint {
    case dataSync(payload: SyncPayload)
    case dataFetch
    case imageGenerate(prompt: String)
    case videoGenerate(scans: [String])
    case metabolicUpdate(payload: MetabolicBatchUpdatePayload)
    case bloodworkParse
    case bodyScanProgressReel(scanIds: [String])
    case musicSuggest(mood: String?, genre: String?)
    case supplementsAnalyze(supplements: [String])
    case macrosCalculate(profile: UserProfileDTO)
    case mealPrepGenerate(payload: MealPrepGeneratePayload)
    case mealPrepGroceryList(recipes: [String])
    case calendarToken
    case calendarFeed(token: String)
    case cookingConnect(provider: String)
    case cookingImport
    case feedbackSubmit(rating: Int?, text: String)

    public var path: String {
        switch self {
        case .dataSync, .dataFetch: return "/api/data/sync"
        case .imageGenerate: return "/api/images/generate"
        case .videoGenerate: return "/api/video/generate"
        case .metabolicUpdate: return "/api/metabolic/update"
        case .bloodworkParse: return "/api/bloodwork/parse"
        case .bodyScanProgressReel: return "/api/body-scan/progress-reel"
        case .musicSuggest: return "/api/music/suggest"
        case .supplementsAnalyze: return "/api/supplements/analyze"
        case .macrosCalculate: return "/api/macros/calculate"
        case .mealPrepGenerate: return "/api/meal-prep/generate"
        case .mealPrepGroceryList: return "/api/meal-prep/grocery-list"
        case .calendarToken: return "/api/calendar/token"
        case .calendarFeed: return "/api/calendar/feed"
        case .cookingConnect: return "/api/cooking/connect"
        case .cookingImport: return "/api/cooking/import"
        case .feedbackSubmit: return "/api/feedback"
        }
    }

    public var method: HTTPMethod {
        switch self {
        case .dataFetch, .calendarFeed: return .GET
        default: return .POST
        }
    }

    public var queryItems: [URLQueryItem]? {
        switch self {
        case .calendarFeed(let token):
            return [URLQueryItem(name: "token", value: token)]
        default:
            return nil
        }
    }

    public var body: (any Encodable)? {
        switch self {
        case .dataSync(let payload): return AnyEncodable(payload)
        case .imageGenerate(let prompt): return AnyEncodable(["prompt": prompt])
        case .videoGenerate(let scans): return AnyEncodable(["scanIds": scans])
        case .metabolicUpdate(let payload): return AnyEncodable(payload)
        case .bodyScanProgressReel(let ids): return AnyEncodable(["scanIds": ids])
        case .musicSuggest(let mood, let genre): return AnyEncodable(MiscMusicSuggestPayload(mood: mood, genre: genre))
        case .supplementsAnalyze(let supps): return AnyEncodable(["supplements": supps])
        case .macrosCalculate(let profile): return AnyEncodable(profile)
        case .mealPrepGenerate(let payload): return AnyEncodable(payload)
        case .mealPrepGroceryList(let recipes): return AnyEncodable(["recipes": recipes])
        case .cookingConnect(let provider): return AnyEncodable(["provider": provider])
        case .feedbackSubmit(let rating, let text): return AnyEncodable(FeedbackPayload(rating: rating, text: text))
        default: return nil
        }
    }
}

public struct MealEntryDTO: Codable, Sendable {
    public var id: String
    public var date: String
    public var mealType: String
    public var name: String
    public var macros: Macros
    public var notes: String?
    public var imageUrl: String?
    public var loggedAt: String?
}

public struct MilestoneEntryDTO: Codable, Sendable {
    public var id: String
    public var earnedAt: String
    public var progress: Double?
}

public struct HydrationEntryDTO: Codable, Sendable {
    public var id: String
    public var date: String
    public var time: String
    public var amountMl: Int
    public var source: String?  // server marks this optional
}

public struct FastingSessionDTO: Codable, Sendable {
    public var id: String
    public var startTime: String
    public var endTime: String?
    public var targetHours: Int
    public var fastingProtocol: String

    // Server sends "protocol" but that's a Swift reserved keyword.
    enum CodingKeys: String, CodingKey {
        case id, startTime, endTime, targetHours
        case fastingProtocol = "protocol"
    }
}

public struct BiofeedbackEntryDTO: Codable, Sendable {
    public var id: String
    public var date: String
    public var time: String
    public var energy: Int
    public var mood: Int
    public var hunger: Int
    public var stress: Int
    public var soreness: Int
    public var notes: String?
}

// MARK: - Supplement DTO

public struct SupplementDTO: Codable, Sendable {
    public var id: String
    public var name: String
    public var dosage: String
    public var frequency: String
    public var timing: String
    public var takenToday: Bool?
}

// MARK: - BloodWork DTOs

public struct BloodWorkMarkerDTO: Codable, Sendable {
    public var name: String
    public var value: Double
    public var unit: String
    public var normalRange: NormalRangeDTO
    public var status: String

    public struct NormalRangeDTO: Codable, Sendable {
        public var low: Double
        public var high: Double
    }
}

public struct BloodWorkDTO: Codable, Sendable {
    public var id: String
    public var date: String
    public var markers: [BloodWorkMarkerDTO]
    public var notes: String?
}

// MARK: - BodyScan DTO

public struct BodyScanPhotosDTO: Codable, Sendable {
    public var front: String?
    public var side: String?
    public var back: String?
}

public struct BodyScanDTO: Codable, Sendable {
    public var id: String
    public var date: String
    public var photos: BodyScanPhotosDTO
    public var analysis: String?
    public var bodyFatEstimate: Double?
    public var muscleAssessment: String?
    public var notes: String?
}

// MARK: - PantryItem DTO

public struct PantryItemDTO: Codable, Sendable {
    public var id: String
    public var name: String
    public var category: String
    public var addedAt: String
    public var expiresAt: String?
}

// MARK: - Wearable DTOs

public struct WearableConnectionDTO: Codable, Sendable {
    public var provider: String
    public var connectedAt: String
    public var label: String?
}

public struct WearableDaySummaryDTO: Codable, Sendable {
    public var date: String
    public var provider: String
    public var steps: Int?
    public var caloriesBurned: Double?
    public var activeMinutes: Int?
    public var sleepScore: Int?
    public var sleepDuration: Int?
    public var readinessScore: Int?
    public var heartRateAvg: Int?
    public var heartRateResting: Int?
    /// Pounds (`sync-schema` wearable payloads).
    public var weight: Double?
    public var bodyFatPercent: Double?
    /// Pounds (`sync-schema` wearable payloads).
    public var muscleMass: Double?
    /// Server normalizes to canonical lbs; omit or send `lbs`/`kg` (`sync-schema`).
    public var weightUnit: String?
    public var muscleMassUnit: String?
}

// MARK: - ActivityLog DTO

public struct ActivityLogEntryDTO: Codable, Sendable {
    public var id: String
    public var date: String
    public var label: String
    public var category: String
    public var durationMinutes: Int
    public var calorieAdjustment: Int
    public var loggedAt: String?

    // Server uses "type" but that's a Swift reserved keyword in some contexts;
    // store as entryType on the Swift side.
    public var entryType: String

    enum CodingKeys: String, CodingKey {
        case id, date, label, category, durationMinutes, calorieAdjustment, loggedAt
        case entryType = "type"
    }
}

// MARK: - MetabolicModel DTO

public struct MetabolicDataPointDTO: Codable, Sendable {
    public var date: String
    public var weightKg: Double
    public var totalIntake: Double
    public var totalExpenditure: Double
}

public struct MetabolicHistoryEntryDTO: Codable, Sendable {
    public var date: String
    public var tdee: Double
    public var confidence: Double
}

public struct MetabolicModelDTO: Codable, Sendable {
    public var estimatedTDEE: Double
    public var confidence: Double
    public var dataPoints: [MetabolicDataPointDTO]
    public var lastUpdated: String
    public var history: [MetabolicHistoryEntryDTO]
}

// MARK: - Sync meta (GET `meta` object — matches web `/api/data/sync` response)

public struct RicoMessageDTO: Codable, Sendable {
    public let role: String
    public let content: String
    public let at: String
}

public struct MeasurementTargetsDTO: Codable, Sendable {
    public var targetWeightLbs: Double?
    public var targetBodyFatPercent: Double?
    public var targetMuscleMassLbs: Double?
}

public struct SyncMetaDTO: Codable, Sendable {
    public let xp: Int?
    public let hasAdjusted: Bool?
    public let ricoHistory: [RicoMessageDTO]?
    public let measurementTargets: MeasurementTargetsDTO?
}

// MARK: - Sync payload / response

public struct SyncPayload: Encodable, Sendable {
    public let profile: UserProfileDTO?
    public let meals: [MealEntryDTO]?
    public let plan: FitnessPlanDTO?
    public let milestones: [MilestoneEntryDTO]?
    public let hydration: [HydrationEntryDTO]?
    public let fastingSessions: [FastingSessionDTO]?
    public let biofeedback: [BiofeedbackEntryDTO]?
    public let supplements: [SupplementDTO]?
    public let bloodWork: [BloodWorkDTO]?
    public let bodyScans: [BodyScanDTO]?
    public let pantry: [PantryItemDTO]?
    public let activityLog: [ActivityLogEntryDTO]?
    public let workoutProgress: [String: String]?
    public let wearableConnections: [WearableConnectionDTO]?
    public let wearableData: [WearableDaySummaryDTO]?
    public let metabolicModel: MetabolicModelDTO?
    public let xp: Int?
    public let hasAdjusted: Bool?
    public let ricoHistory: [RicoMessageDTO]?
    public let recentExerciseNames: [String]?
    public let measurementTargets: MeasurementTargetsDTO?

    public init(
        profile: UserProfileDTO? = nil,
        meals: [MealEntryDTO]? = nil,
        plan: FitnessPlanDTO? = nil,
        milestones: [MilestoneEntryDTO]? = nil,
        hydration: [HydrationEntryDTO]? = nil,
        fastingSessions: [FastingSessionDTO]? = nil,
        biofeedback: [BiofeedbackEntryDTO]? = nil,
        supplements: [SupplementDTO]? = nil,
        bloodWork: [BloodWorkDTO]? = nil,
        bodyScans: [BodyScanDTO]? = nil,
        pantry: [PantryItemDTO]? = nil,
        activityLog: [ActivityLogEntryDTO]? = nil,
        workoutProgress: [String: String]? = nil,
        wearableConnections: [WearableConnectionDTO]? = nil,
        wearableData: [WearableDaySummaryDTO]? = nil,
        metabolicModel: MetabolicModelDTO? = nil,
        xp: Int? = nil,
        hasAdjusted: Bool? = nil,
        ricoHistory: [RicoMessageDTO]? = nil,
        recentExerciseNames: [String]? = nil,
        measurementTargets: MeasurementTargetsDTO? = nil
    ) {
        self.profile = profile
        self.meals = meals
        self.plan = plan
        self.milestones = milestones
        self.hydration = hydration
        self.fastingSessions = fastingSessions
        self.biofeedback = biofeedback
        self.supplements = supplements
        self.bloodWork = bloodWork
        self.bodyScans = bodyScans
        self.pantry = pantry
        self.activityLog = activityLog
        self.workoutProgress = workoutProgress
        self.wearableConnections = wearableConnections
        self.wearableData = wearableData
        self.metabolicModel = metabolicModel
        self.xp = xp
        self.hasAdjusted = hasAdjusted
        self.ricoHistory = ricoHistory
        self.recentExerciseNames = recentExerciseNames
        self.measurementTargets = measurementTargets
    }
}

public struct SyncResponseDTO: Decodable, Sendable {
    public let profile: UserProfileDTO?
    public let plan: FitnessPlanDTO?
    public let meals: [MealEntryDTO]?
    public let milestones: [MilestoneEntryDTO]?
    public let hydration: [HydrationEntryDTO]?
    public let fastingSessions: [FastingSessionDTO]?
    public let biofeedback: [BiofeedbackEntryDTO]?
    public let supplements: [SupplementDTO]?
    public let bloodWork: [BloodWorkDTO]?
    public let bodyScans: [BodyScanDTO]?
    public let pantry: [PantryItemDTO]?
    public let wearableConnections: [WearableConnectionDTO]?
    public let wearableData: [WearableDaySummaryDTO]?
    /// Always an array in current API; missing key decodes as `[]` for older responses.
    public let activityLog: [ActivityLogEntryDTO]
    public let metabolicModel: MetabolicModelDTO?
    public let workoutProgress: [String: String]?
    public let meta: SyncMetaDTO?

    private enum CodingKeys: String, CodingKey {
        case profile, plan, meals, milestones, hydration, fastingSessions, biofeedback
        case supplements, bloodWork, bodyScans, pantry, wearableConnections, wearableData
        case activityLog, metabolicModel, workoutProgress, meta
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        profile = try c.decodeIfPresent(UserProfileDTO.self, forKey: .profile)
        plan = try c.decodeIfPresent(FitnessPlanDTO.self, forKey: .plan)
        meals = try c.decodeIfPresent([MealEntryDTO].self, forKey: .meals)
        milestones = try c.decodeIfPresent([MilestoneEntryDTO].self, forKey: .milestones)
        hydration = try c.decodeIfPresent([HydrationEntryDTO].self, forKey: .hydration)
        fastingSessions = try c.decodeIfPresent([FastingSessionDTO].self, forKey: .fastingSessions)
        biofeedback = try c.decodeIfPresent([BiofeedbackEntryDTO].self, forKey: .biofeedback)
        supplements = try c.decodeIfPresent([SupplementDTO].self, forKey: .supplements)
        bloodWork = try c.decodeIfPresent([BloodWorkDTO].self, forKey: .bloodWork)
        bodyScans = try c.decodeIfPresent([BodyScanDTO].self, forKey: .bodyScans)
        pantry = try c.decodeIfPresent([PantryItemDTO].self, forKey: .pantry)
        wearableConnections = try c.decodeIfPresent([WearableConnectionDTO].self, forKey: .wearableConnections)
        wearableData = try c.decodeIfPresent([WearableDaySummaryDTO].self, forKey: .wearableData)
        activityLog = try c.decodeIfPresent([ActivityLogEntryDTO].self, forKey: .activityLog) ?? []
        metabolicModel = try c.decodeIfPresent(MetabolicModelDTO.self, forKey: .metabolicModel)
        workoutProgress = try c.decodeIfPresent([String: String].self, forKey: .workoutProgress)
        meta = try c.decodeIfPresent(SyncMetaDTO.self, forKey: .meta)
    }
}

// MARK: - Weekly review (POST /api/agent/weekly-review)

public struct WeeklyReviewGeneratePayload: Encodable, Sendable {
    public let meals: [MealReviewEntryPayload]
    public let targets: Macros
    public let wearableData: [WearableReviewEntryPayload]
    public let goal: String
    public let userName: String

    public init(
        meals: [MealReviewEntryPayload],
        targets: Macros,
        wearableData: [WearableReviewEntryPayload],
        goal: String,
        userName: String
    ) {
        self.meals = meals
        self.targets = targets
        self.wearableData = wearableData
        self.goal = goal
        self.userName = userName
    }
}

public struct MealReviewEntryPayload: Encodable, Sendable {
    public let id: String
    public let date: String
    public let mealType: String
    public let name: String
    public let macros: Macros

    public init(id: String, date: String, mealType: String, name: String, macros: Macros) {
        self.id = id
        self.date = date
        self.mealType = mealType
        self.name = name
        self.macros = macros
    }
}

public struct WearableReviewEntryPayload: Encodable, Sendable {
    public let date: String
    public let provider: String
    public let steps: Int?
    public let caloriesBurned: Double?
    public let activeMinutes: Int?
    public let sleepScore: Int?
    public let sleepDuration: Int?
    public let readinessScore: Int?
    public let heartRateAvg: Int?
    public let heartRateResting: Int?
    public let weight: Double?
    public let bodyFatPercent: Double?
    public let muscleMass: Double?

    public init(
        date: String,
        provider: String,
        steps: Int?,
        caloriesBurned: Double?,
        activeMinutes: Int?,
        sleepScore: Int?,
        sleepDuration: Int?,
        readinessScore: Int?,
        heartRateAvg: Int?,
        heartRateResting: Int?,
        weight: Double?,
        bodyFatPercent: Double?,
        muscleMass: Double?
    ) {
        self.date = date
        self.provider = provider
        self.steps = steps
        self.caloriesBurned = caloriesBurned
        self.activeMinutes = activeMinutes
        self.sleepScore = sleepScore
        self.sleepDuration = sleepDuration
        self.readinessScore = readinessScore
        self.heartRateAvg = heartRateAvg
        self.heartRateResting = heartRateResting
        self.weight = weight
        self.bodyFatPercent = bodyFatPercent
        self.muscleMass = muscleMass
    }
}

// MARK: - Metabolic model (POST /api/metabolic/update)

public struct MetabolicDataPointPayload: Encodable, Sendable {
    public let date: String
    public let weightKg: Double
    public let totalIntake: Double
    public let totalExpenditure: Double

    public init(date: String, weightKg: Double, totalIntake: Double, totalExpenditure: Double) {
        self.date = date
        self.weightKg = weightKg
        self.totalIntake = totalIntake
        self.totalExpenditure = totalExpenditure
    }
}

public struct MetabolicBatchUpdatePayload: Encodable, Sendable {
    public let dataPoints: [MetabolicDataPointPayload]
    public let currentTDEE: Int
    public let history: [MetabolicHistoryEntry]

    public init(dataPoints: [MetabolicDataPointPayload], currentTDEE: Int, history: [MetabolicHistoryEntry] = []) {
        self.dataPoints = dataPoints
        self.currentTDEE = currentTDEE
        self.history = history
    }
}

public struct MetabolicModelResponseHistoryEntry: Decodable, Sendable {
    public let date: String
    public let tdee: Double
    public let confidence: Int
}

public struct MetabolicModelResponse: Decodable, Sendable {
    public let estimatedTDEE: Double
    public let confidence: Int
    public let lastUpdated: String?
    public let message: String?
    public let history: [MetabolicModelResponseHistoryEntry]

    enum CodingKeys: String, CodingKey {
        case estimatedTDEE
        case confidence
        case lastUpdated
        case message
        case history
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        if let d = try c.decodeIfPresent(Double.self, forKey: .estimatedTDEE) {
            estimatedTDEE = d
        } else if let i = try c.decodeIfPresent(Int.self, forKey: .estimatedTDEE) {
            estimatedTDEE = Double(i)
        } else {
            estimatedTDEE = 0
        }
        confidence = try c.decodeIfPresent(Int.self, forKey: .confidence) ?? 0
        lastUpdated = try c.decodeIfPresent(String.self, forKey: .lastUpdated)
        message = try c.decodeIfPresent(String.self, forKey: .message)
        history = (try? c.decodeIfPresent([MetabolicModelResponseHistoryEntry].self, forKey: .history)) ?? []
    }

    public init(estimatedTDEE: Double, confidence: Int, lastUpdated: String?, message: String? = nil, history: [MetabolicModelResponseHistoryEntry] = []) {
        self.estimatedTDEE = estimatedTDEE
        self.confidence = confidence
        self.lastUpdated = lastUpdated
        self.message = message
        self.history = history
    }
}

// MARK: - Meal prep generate (POST /api/meal-prep/generate)

public struct MealPrepGeneratePayload: Encodable, Sendable {
    public let dailyTargets: Macros
    public let dietaryRestrictions: [String]
    public let pantryItems: [String]
    public let preferences: String?

    public init(
        dailyTargets: Macros,
        dietaryRestrictions: [String],
        pantryItems: [String],
        preferences: String?
    ) {
        self.dailyTargets = dailyTargets
        self.dietaryRestrictions = dietaryRestrictions
        self.pantryItems = pantryItems
        self.preferences = preferences
    }
}

public struct MealPrepGenerateResponse: Decodable, Sendable {
    fileprivate struct RecipeDTO: Decodable, Sendable {
        let name: String
        let servings: Int
        let macrosPerServing: Macros
        let ingredients: [MealPrepRecipe.Ingredient]
        let instructions: [String]
        let prepTime: Int
        let cookTime: Int
    }

    private let recipes: [RecipeDTO]
    public let batchInstructions: [String]
    public let estimatedPrepTime: Int

    public func toRecipes() -> [MealPrepRecipe] {
        recipes.map {
            MealPrepRecipe(
                name: $0.name,
                servings: $0.servings,
                macrosPerServing: $0.macrosPerServing,
                ingredients: $0.ingredients,
                instructions: $0.instructions,
                prepTime: $0.prepTime,
                cookTime: $0.cookTime
            )
        }
    }
}

public struct MiscMusicSuggestPayload: Encodable {
    let mood: String?
    let genre: String?
}

public struct FeedbackPayload: Encodable {
    let rating: Int?
    let text: String
}

public struct ImageGenerateResponse: Decodable {
    let imageUrl: String?
    let imageBase64: String?
}
