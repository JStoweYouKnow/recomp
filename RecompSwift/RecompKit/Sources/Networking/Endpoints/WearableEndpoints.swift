import Foundation

enum WearableAPI: APIEndpoint {
    case ouraConnect(token: String)
    case ouraData
    case ouraDisconnect
    case fitbitAuth
    case fitbitData
    case fitbitDisconnect
    case appleHealthSync(data: HealthSyncPayload)
    case healthImport(data: Data)
    case scaleEntry(payload: ScaleEntryPayload)

    var path: String {
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

    var method: HTTPMethod {
        switch self {
        case .ouraData, .fitbitAuth, .fitbitData: return .GET
        default: return .POST
        }
    }

    var body: (any Encodable)? {
        switch self {
        case .ouraConnect(let token): return AnyEncodable(["token": token])
        case .appleHealthSync(let data): return AnyEncodable(data)
        case .scaleEntry(let payload): return AnyEncodable(payload)
        default: return nil
        }
    }
}

struct HealthSyncPayload: Encodable {
    let steps: Int?
    let activeCalories: Double?
    let weight: Double?
    let bodyFat: Double?
    let sleepMinutes: Int?
    let heartRateAvg: Int?
    let heartRateResting: Int?
    let date: String
}

struct ScaleEntryPayload: Encodable {
    let date: String
    let weight: Double?
    let bodyFatPercent: Double?
    let muscleMass: Double?
    let bmi: Double?
    let bmr: Double?
    let metabolicAge: Int?
}
