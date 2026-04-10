import Foundation

public enum CoachAPI: APIEndpoint {
    case chat(message: String, history: [CoachMessageDTO])
    case checkIn
    case confront(pattern: String)

    public var path: String {
        switch self {
        case .chat: return "/api/rico"
        case .checkIn: return "/api/coach/check-in"
        case .confront: return "/api/confront"
        }
    }

    public var method: HTTPMethod { .POST }

    public var body: (any Encodable)? {
        switch self {
        case .chat(let message, let history):
            return AnyEncodable(CoachChatPayload(message: message, history: history))
        case .confront(let pattern):
            return AnyEncodable(["pattern": pattern])
        default:
            return nil
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
