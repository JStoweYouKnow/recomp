import Foundation

enum AuthAPI: APIEndpoint {
    case register(SignUpPayload)
    case login(email: String, password: String)
    case me
    case demo
    case claim(email: String, password: String)

    var path: String {
        switch self {
        case .register: return "/api/auth/register"
        case .login: return "/api/auth/login"
        case .me: return "/api/auth/me"
        case .demo: return "/api/auth/demo"
        case .claim: return "/api/auth/claim"
        }
    }

    var method: HTTPMethod {
        switch self {
        case .me: return .GET
        default: return .POST
        }
    }

    var body: (any Encodable)? {
        switch self {
        case .register(let payload):
            return AnyEncodable(payload)
        case .login(let email, let password):
            return AnyEncodable(LoginPayload(email: email, password: password))
        case .claim(let email, let password):
            return AnyEncodable(LoginPayload(email: email, password: password))
        default:
            return nil
        }
    }
}

private struct LoginPayload: Encodable {
    let email: String
    let password: String
}

struct AuthResponse: Decodable {
    let authenticated: Bool
    let profile: UserProfileDTO?
    let userId: String?
}

struct UserProfileDTO: Codable, Sendable {
    var id: String
    var name: String
    var email: String?
    var avatarDataUrl: String?
    var age: Int
    var weight: Double
    var height: Double
    var gender: String
    var fitnessLevel: String
    var goal: String
    var dietaryRestrictions: [String]?
    var injuriesOrLimitations: [String]?
    var dailyActivityLevel: String?
    var unitSystem: String?
    var workoutLocation: String?
    var workoutEquipment: [String]?
    var workoutDaysPerWeek: Int?
    var workoutTimeframe: String?
    var createdAt: String?
}
