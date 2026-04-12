import Foundation

public enum AuthAPI: APIEndpoint {
    case register(SignUpPayload)
    case login(email: String, password: String)
    case me
    case demo
    case claim(email: String, password: String)

    public var path: String {
        switch self {
        case .register: return "/api/auth/register"
        case .login: return "/api/auth/login"
        case .me: return "/api/auth/me"
        case .demo: return "/api/auth/demo"
        case .claim: return "/api/auth/claim"
        }
    }

    public var method: HTTPMethod {
        switch self {
        case .me: return .GET
        default: return .POST
        }
    }

    public var body: (any Encodable)? {
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

public struct AuthResponse: Decodable {
    let authenticated: Bool
    let profile: UserProfileDTO?
    let userId: String?
}

public struct UserProfileDTO: Codable, Sendable {
    public var id: String
    public var name: String
    public var email: String?
    public var avatarDataUrl: String?
    public var age: Int
    public var weight: Double
    public var height: Double
    public var gender: String
    public var fitnessLevel: String
    public var goal: String
    public var dietaryRestrictions: [String]?
    public var injuriesOrLimitations: [String]?
    public var dailyActivityLevel: String?
    public var unitSystem: String?
    public var workoutLocation: String?
    public var workoutEquipment: [String]?
    public var workoutDaysPerWeek: Int?
    public var workoutTimeframe: String?
    public var createdAt: String?

    public init(
        id: String,
        name: String,
        email: String? = nil,
        avatarDataUrl: String? = nil,
        age: Int,
        weight: Double,
        height: Double,
        gender: String,
        fitnessLevel: String,
        goal: String,
        dietaryRestrictions: [String]? = nil,
        injuriesOrLimitations: [String]? = nil,
        dailyActivityLevel: String? = nil,
        unitSystem: String? = nil,
        workoutLocation: String? = nil,
        workoutEquipment: [String]? = nil,
        workoutDaysPerWeek: Int? = nil,
        workoutTimeframe: String? = nil,
        createdAt: String? = nil
    ) {
        self.id = id
        self.name = name
        self.email = email
        self.avatarDataUrl = avatarDataUrl
        self.age = age
        self.weight = weight
        self.height = height
        self.gender = gender
        self.fitnessLevel = fitnessLevel
        self.goal = goal
        self.dietaryRestrictions = dietaryRestrictions
        self.injuriesOrLimitations = injuriesOrLimitations
        self.dailyActivityLevel = dailyActivityLevel
        self.unitSystem = unitSystem
        self.workoutLocation = workoutLocation
        self.workoutEquipment = workoutEquipment
        self.workoutDaysPerWeek = workoutDaysPerWeek
        self.workoutTimeframe = workoutTimeframe
        self.createdAt = createdAt
    }
}
