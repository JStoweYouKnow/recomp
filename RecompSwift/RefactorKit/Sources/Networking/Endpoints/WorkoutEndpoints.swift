import Foundation

public enum WorkoutAPI: APIEndpoint {
    case exerciseSearch(name: String)
    case exerciseGif(id: String)
    case recoveryAdjust(payload: RecoveryPayload)
    case parseUrl(url: String)
    case parsePdf
    case adapt(workout: WorkoutDay?, days: [WorkoutDay]?)
    case teachSubstitutions(substitutions: [SubstitutionTeachItem])

    public var path: String {
        switch self {
        case .exerciseSearch: return "/api/exercises/search"
        case .exerciseGif: return "/api/exercises/gif"
        case .recoveryAdjust: return "/api/workouts/recovery-adjust"
        case .parseUrl: return "/api/workouts/parse-url"
        case .parsePdf: return "/api/workouts/parse-pdf"
        case .adapt: return "/api/workouts/adapt"
        case .teachSubstitutions: return "/api/workouts/substitutions"
        }
    }

    public var method: HTTPMethod {
        switch self {
        case .exerciseSearch, .exerciseGif: return .GET
        case .recoveryAdjust, .parseUrl, .parsePdf, .adapt, .teachSubstitutions: return .POST
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
        case .adapt(let workout, let days):
            return AnyEncodable(AdaptWorkoutPayload(workout: workout, days: days))
        case .teachSubstitutions(let substitutions):
            return AnyEncodable(["substitutions": substitutions])
        default:
            return nil
        }
    }
}

private struct AdaptWorkoutPayload: Encodable {
    let workout: WorkoutDay?
    let days: [WorkoutDay]?
}

public struct SubstitutionTeachItem: Encodable, Sendable {
    public let original: String
    public let replacement: String
    public let reason: String?
    public let source: String?

    public init(original: String, replacement: String, reason: String? = nil, source: String? = "import") {
        self.original = original
        self.replacement = replacement
        self.reason = reason
        self.source = source
    }
}

public struct WorkoutAdaptSwap: Codable, Identifiable, Sendable {
    public let dayLabel: String?
    public let section: String
    public let index: Int
    public let original: String
    public var replacement: String
    public let reason: String
    public let source: String

    public var id: String { "\(dayLabel ?? "")-\(section)-\(index)-\(original)" }
}

public struct WorkoutAdaptResponse: Decodable, Sendable {
    public let workout: WorkoutDay?
    public let days: [WorkoutDay]?
    public let swaps: [WorkoutAdaptSwap]
    public let learnedApplied: Int?
    public let catalogApplied: Int?
    public let llmApplied: Int?
}

public struct WorkoutAdaptResult: Sendable {
    public let workout: WorkoutDay
    public let days: [WorkoutDay]?
    public let swaps: [WorkoutAdaptSwap]
    public let learnedApplied: Int
    public let catalogApplied: Int
    public let llmApplied: Int

    public var isFullProgram: Bool {
        (days?.count ?? 0) > 1
    }
}

public struct WorkoutImportResponse: Decodable {
    public let workout: WorkoutDay
    public let days: [WorkoutDay]?
    public let programTitle: String?
    public let dayCount: Int?
}

public struct WorkoutImportResult: Sendable {
    public let workout: WorkoutDay
    public let days: [WorkoutDay]?
    public let programTitle: String?

    public var isFullProgram: Bool {
        (days?.count ?? 0) > 1
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
