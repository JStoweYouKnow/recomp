import Foundation

public enum CoachAPI: APIEndpoint {
    case chat(message: String, history: [CoachMessageDTO])
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
        case .chat(let message, let history):
            return AnyEncodable(CoachChatPayload(message: message, history: history))
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
}

public struct CoachMessageDTO: Codable, Sendable {
    let role: String
    let content: String
    let at: String?
}

public struct CoachChatResponse: Decodable {
    let reply: String
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
