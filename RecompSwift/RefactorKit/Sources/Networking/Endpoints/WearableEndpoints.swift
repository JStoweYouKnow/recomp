import Foundation

public enum WearableAPI: APIEndpoint {
    case ouraConnect(token: String)
    case ouraData
    case ouraDisconnect
    case fitbitAuth
    case fitbitData
    case fitbitDisconnect
    case appleHealthSync(data: HealthSyncPayload)
    case healthImport(data: Data)
    case scaleEntry(payload: ScaleEntryPayload)

    public var path: String {
        switch self {
        case .ouraConnect: return "/api/wearables/oura/connect"
        case .ouraData: return "/api/wearables/oura/data"
        case .ouraDisconnect: return "/api/wearables/oura/disconnect"
        case .fitbitAuth: return "/api/wearables/fitbit/auth"
        case .fitbitData: return "/api/wearables/fitbit/data"
        case .fitbitDisconnect: return "/api/wearables/fitbit/disconnect"
        case .appleHealthSync: return "/api/wearables/apple/healthkit"
        case .healthImport: return "/api/wearables/health/import"
        case .scaleEntry: return "/api/wearables/scale/entry"
        }
    }

    public var method: HTTPMethod {
        switch self {
        case .ouraData, .fitbitAuth, .fitbitData: return .GET
        default: return .POST
        }
    }

    public var body: (any Encodable)? {
        switch self {
        case .ouraConnect(let token): return AnyEncodable(["token": token])
        case .appleHealthSync(let data): return AnyEncodable(data)
        case .healthImport: return nil
        case .scaleEntry(let payload): return AnyEncodable(payload)
        default: return nil
        }
    }
}

public struct HealthSyncPayload: Encodable, Sendable {
    public let steps: Int?
    public let activeCalories: Double?
    public let weight: Double?
    public let bodyFat: Double?
    public let sleepMinutes: Int?
    public let heartRateAvg: Int?
    public let heartRateResting: Int?
    public let date: String

    public init(
        steps: Int?,
        activeCalories: Double?,
        weight: Double?,
        bodyFat: Double?,
        sleepMinutes: Int?,
        heartRateAvg: Int?,
        heartRateResting: Int?,
        date: String
    ) {
        self.steps = steps
        self.activeCalories = activeCalories
        self.weight = weight
        self.bodyFat = bodyFat
        self.sleepMinutes = sleepMinutes
        self.heartRateAvg = heartRateAvg
        self.heartRateResting = heartRateResting
        self.date = date
    }
}

public struct ScaleEntryPayload: Encodable, Sendable {
    public let date: String
    public let weightLbs: Double?
    public let bodyFatPercent: Double?
    public let muscleMass: Double?
    public let bmi: Double?
    public let bmr: Double?
    public let metabolicAge: Int?

    public init(
        date: String,
        weightLbs: Double? = nil,
        bodyFatPercent: Double? = nil,
        muscleMass: Double? = nil,
        bmi: Double? = nil,
        bmr: Double? = nil,
        metabolicAge: Int? = nil
    ) {
        self.date = date
        self.weightLbs = weightLbs
        self.bodyFatPercent = bodyFatPercent
        self.muscleMass = muscleMass
        self.bmi = bmi
        self.bmr = bmr
        self.metabolicAge = metabolicAge
    }
}
