import Foundation

enum CoachAPI: APIEndpoint {
    case chat(message: String, history: [CoachMessageDTO])
    case checkIn
    case confront(pattern: String)

    var path: String {
        switch self {
        case .chat: return "/api/rico"
        case .checkIn: return "/api/coach/check-in"
        case .confront: return "/api/confront"
        }
    }

    var method: HTTPMethod { .POST }

    var body: (any Encodable)? {
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

struct CoachChatPayload: Encodable {
    let message: String
    let history: [CoachMessageDTO]
}

struct CoachMessageDTO: Codable, Sendable {
    let role: String
    let content: String
    let at: String?
}

struct CoachChatResponse: Decodable {
    let reply: String
}
