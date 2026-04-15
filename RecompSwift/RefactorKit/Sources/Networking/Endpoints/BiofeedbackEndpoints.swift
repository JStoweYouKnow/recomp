import Foundation

/// Mirrors `POST /api/biofeedback/insights` (see `recomp/src/app/api/biofeedback/insights/route.ts`).
public enum BiofeedbackAPI: APIEndpoint {
    case insights(payload: BiofeedbackInsightsRequest)

    public var path: String { "/api/biofeedback/insights" }
    public var method: HTTPMethod { .POST }

    public var body: (any Encodable)? {
        switch self {
        case .insights(let payload):
            return AnyEncodable(payload)
        }
    }
}

public struct BiofeedbackInsightsRequest: Encodable, Sendable {
    public let biofeedback: [BiofeedbackRowPayload]
    public let meals: [MealInsightRowPayload]
    public let wearableData: [WearableInsightRowPayload]

    public init(
        biofeedback: [BiofeedbackRowPayload],
        meals: [MealInsightRowPayload],
        wearableData: [WearableInsightRowPayload]
    ) {
        self.biofeedback = biofeedback
        self.meals = meals
        self.wearableData = wearableData
    }
}

public struct BiofeedbackRowPayload: Encodable, Sendable {
    public let date: String
    public let time: String
    public let energy: Int
    public let mood: Int
    public let hunger: Int
    public let stress: Int
    public let soreness: Int

    public init(date: String, time: String, energy: Int, mood: Int, hunger: Int, stress: Int, soreness: Int) {
        self.date = date
        self.time = time
        self.energy = energy
        self.mood = mood
        self.hunger = hunger
        self.stress = stress
        self.soreness = soreness
    }
}

public struct MealInsightRowPayload: Encodable, Sendable {
    public let date: String
    public let name: String
    public let macros: Macros

    public init(date: String, name: String, macros: Macros) {
        self.date = date
        self.name = name
        self.macros = macros
    }
}

public struct WearableInsightRowPayload: Encodable, Sendable {
    public let date: String
    public let provider: String
    public let steps: Int?
    public let caloriesBurned: Double?
    public let sleepScore: Int?
    public let sleepDuration: Int?
    public let weight: Double?

    public init(
        date: String,
        provider: String,
        steps: Int?,
        caloriesBurned: Double?,
        sleepScore: Int?,
        sleepDuration: Int?,
        weight: Double?
    ) {
        self.date = date
        self.provider = provider
        self.steps = steps
        self.caloriesBurned = caloriesBurned
        self.sleepScore = sleepScore
        self.sleepDuration = sleepDuration
        self.weight = weight
    }
}

public struct BiofeedbackInsightsResponse: Decodable, Sendable {
    public struct CorrelationRow: Decodable, Sendable {
        public let factor: String
        public let observation: String
        public let strength: String
    }

    public let correlations: [CorrelationRow]
    public let recommendations: [String]
}
