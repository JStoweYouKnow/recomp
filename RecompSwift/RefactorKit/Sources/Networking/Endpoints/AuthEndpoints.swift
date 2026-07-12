import Foundation

public enum AuthAPI: APIEndpoint {
    case register(SignUpPayload)
    case login(email: String, password: String)
    case me
    case demo
    case claim(email: String, password: String)
    case forgotPassword(email: String)
    case resetPassword(email: String, code: String, newPassword: String)
    case deleteAccount

    public var path: String {
        switch self {
        case .register: return "/api/auth/register"
        case .login: return "/api/auth/login"
        case .me: return "/api/auth/me"
        case .demo: return "/api/auth/demo"
        case .claim: return "/api/auth/claim"
        case .forgotPassword: return "/api/auth/forgot-password"
        case .resetPassword: return "/api/auth/reset-password"
        case .deleteAccount: return "/api/user/account"
        }
    }

    public var method: HTTPMethod {
        switch self {
        case .me: return .GET
        case .deleteAccount: return .DELETE
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
        case .forgotPassword(let email):
            return AnyEncodable(ForgotPasswordPayload(email: email))
        case .resetPassword(let email, let code, let newPassword):
            return AnyEncodable(ResetPasswordPayload(email: email, code: code, newPassword: newPassword))
        default:
            return nil
        }
    }
}

private struct LoginPayload: Encodable {
    let email: String
    let password: String
}

private struct ForgotPasswordPayload: Encodable {
    let email: String
}

private struct ResetPasswordPayload: Encodable {
    let email: String
    let code: String
    let newPassword: String
}

public struct AuthResponse: Decodable {
    let authenticated: Bool
    let profile: UserProfileDTO?
    let userId: String?
    let apiToken: String?
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
    public var proAccess: Bool?
    public var learnedTDEE: Double?
    public var measurementTargets: MeasurementTargetsDTO?
    public var currentBodyFatPercent: Double?
    public var currentMuscleMassLbs: Double?
    /** Set only for `/api/plans/generate` — not persisted on profile rows. */
    public var programWeeks: Int?

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
        createdAt: String? = nil,
        proAccess: Bool? = nil,
        learnedTDEE: Double? = nil,
        measurementTargets: MeasurementTargetsDTO? = nil,
        currentBodyFatPercent: Double? = nil,
        currentMuscleMassLbs: Double? = nil,
        programWeeks: Int? = nil
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
        self.proAccess = proAccess
        self.learnedTDEE = learnedTDEE
        self.measurementTargets = measurementTargets
        self.currentBodyFatPercent = currentBodyFatPercent
        self.currentMuscleMassLbs = currentMuscleMassLbs
        self.programWeeks = programWeeks
    }
}
