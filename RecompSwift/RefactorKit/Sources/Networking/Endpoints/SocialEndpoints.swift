import Foundation

public enum SocialAPI: APIEndpoint {
    case getSettings
    case updateSettings(visibility: String, username: String?)
    case checkUsername(username: String)
    case publicProfile(usernameOrId: String)

    public var path: String {
        switch self {
        case .getSettings, .updateSettings: return "/api/social/settings"
        case .checkUsername: return "/api/social/username/check"
        case .publicProfile(let id): return "/api/social/profile/\(id)"
        }
    }

    /// `GET` loads settings; `PUT` saves. Username check uses `POST` + JSON body (matches web client).
    public var method: HTTPMethod {
        switch self {
        case .getSettings, .publicProfile: return .GET
        case .updateSettings: return .PUT
        case .checkUsername: return .POST
        }
    }

    public var queryItems: [URLQueryItem]? { nil }

    public var body: (any Encodable)? {
        switch self {
        case .updateSettings(let visibility, let username):
            return AnyEncodable(SocialUpdatePayload(visibility: visibility, username: username))
        case .checkUsername(let username):
            return AnyEncodable(UsernameCheckRequestBody(username: username))
        default:
            return nil
        }
    }
}

private struct UsernameCheckRequestBody: Encodable {
    let username: String
}

public struct SocialUpdatePayload: Encodable {
    let visibility: String
    let username: String?
}

public struct UsernameCheckResponse: Decodable, Sendable {
    public let available: Bool
}

public struct SocialSettingsDTO: Decodable, Sendable {
    public let visibility: String?
    public let username: String?
}
