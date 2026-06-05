import Foundation

public enum WorkoutAPI: APIEndpoint {
    case exerciseSearch(name: String)
    case exerciseGif(id: String)
    case recoveryAdjust(payload: RecoveryPayload)
    case parseUrl(url: String)

    public var path: String {
        switch self {
        case .exerciseSearch: return "/api/exercises/search"
        case .exerciseGif: return "/api/exercises/gif"
        case .recoveryAdjust: return "/api/workouts/recovery-adjust"
        case .parseUrl: return "/api/workouts/parse-url"
        }
    }

    public var method: HTTPMethod {
        switch self {
        case .exerciseSearch, .exerciseGif: return .GET
        case .recoveryAdjust, .parseUrl: return .POST
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
        case .parseUrl(let url):
            return AnyEncodable(["url": url])
        default:
            return nil
        }
    }
}

public struct WorkoutImportResponse: Decodable {
    public let workout: WorkoutDay
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

public struct ExerciseSearchResult: Decodable, Identifiable, Sendable {
    /// Mapped from server field `exerciseId`.
    public let id: String
    public let name: String
    /// Relative path returned by the server proxy, e.g. "/api/exercises/gif?id=...".
    /// Callers must resolve against the API base URL to get an absolute URL.
    public let gifUrl: String?
    public let targetMuscles: [String]?
    public let instructions: [String]?

    enum CodingKeys: String, CodingKey {
        case id = "exerciseId"
        case name, gifUrl, targetMuscles, instructions
    }

    public init(id: String, name: String, gifUrl: String?, targetMuscles: [String]?, instructions: [String]?) {
        self.id = id
        self.name = name
        self.gifUrl = gifUrl
        self.targetMuscles = targetMuscles
        self.instructions = instructions
    }
}
