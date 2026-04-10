import Foundation

public enum WorkoutAPI: APIEndpoint {
    case exerciseSearch(name: String)
    case exerciseGif(id: String)
    case recoveryAdjust(payload: RecoveryPayload)

    public var path: String {
        switch self {
        case .exerciseSearch: return "/api/exercises/search"
        case .exerciseGif: return "/api/exercises/gif"
        case .recoveryAdjust: return "/api/workouts/recovery-adjust"
        }
    }

    public var method: HTTPMethod {
        switch self {
        case .exerciseSearch, .exerciseGif: return .GET
        case .recoveryAdjust: return .POST
        }
    }

    public var queryItems: [URLQueryItem]? {
        switch self {
        case .exerciseSearch(let name):
            return [URLQueryItem(name: "name", value: name)]
        case .exerciseGif(let id):
            return [URLQueryItem(name: "id", value: id)]
        default:
            return nil
        }
    }

    public var body: (any Encodable)? {
        switch self {
        case .recoveryAdjust(let payload):
            return AnyEncodable(payload)
        default:
            return nil
        }
    }
}

public struct RecoveryPayload: Encodable {
    let biofeedback: [String: Int]
    let wearableData: [String: Any]?

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(biofeedback, forKey: .biofeedback)
    }

    enum CodingKeys: String, CodingKey {
        case biofeedback
    }
}

public struct ExerciseSearchResult: Decodable, Identifiable {
    let id: String
    let name: String
    let bodyPart: String?
    let equipment: String?
    let target: String?
    let gifUrl: String?
}
