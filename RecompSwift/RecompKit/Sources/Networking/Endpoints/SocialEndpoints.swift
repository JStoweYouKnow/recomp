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

    public var method: HTTPMethod {
        switch self {
        case .getSettings, .checkUsername, .publicProfile: return .GET
        case .updateSettings: return .PUT
        }
    }

    public var queryItems: [URLQueryItem]? {
        switch self {
        case .checkUsername(let username):
            return [URLQueryItem(name: "username", value: username)]
        default:
            return nil
        }
    }

    public var body: (any Encodable)? {
        switch self {
        case .updateSettings(let visibility, let username):
            return AnyEncodable(SocialUpdatePayload(visibility: visibility, username: username))
        default:
            return nil
        }
    }
}

public struct SocialUpdatePayload: Encodable {
    let visibility: String
    let username: String?
}

public struct UsernameCheckResponse: Decodable {
    let available: Bool
}
