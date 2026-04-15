import Foundation

public enum CalendarAPI: APIEndpoint {
    case generateToken
    case feed(token: String)

    public var path: String {
        switch self {
        case .generateToken: return "/api/calendar/token"
        case .feed: return "/api/calendar/feed"
        }
    }

    public var method: HTTPMethod {
        switch self {
        case .generateToken: return .POST
        case .feed: return .GET
        }
    }

    public var queryItems: [URLQueryItem]? {
        switch self {
        case .feed(let token):
            return [URLQueryItem(name: "token", value: token)]
        default:
            return nil
        }
    }
}

public struct CalendarTokenResponse: Decodable, Sendable {
    public let token: String
    /// Present only if the server embeds a feed URL; otherwise build `/api/calendar/feed?token=…` on the client.
    public let feedUrl: String?

    enum CodingKeys: String, CodingKey {
        case token
        case feedUrl
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        token = try c.decode(String.self, forKey: .token)
        feedUrl = try c.decodeIfPresent(String.self, forKey: .feedUrl)
    }
}
