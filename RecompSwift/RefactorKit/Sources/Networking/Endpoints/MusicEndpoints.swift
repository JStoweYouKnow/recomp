import Foundation

public enum MusicAPI: APIEndpoint {
    case suggest(workoutFocus: String, provider: String?)

    public var path: String { "/api/music/suggest" }
    public var method: HTTPMethod { .POST }

    public var body: (any Encodable)? {
        switch self {
        case .suggest(let focus, let provider):
            return AnyEncodable(MusicSuggestPayload(workoutFocus: focus, provider: provider))
        }
    }
}

public struct MusicSuggestPayload: Encodable, Sendable {
    let workoutFocus: String
    let provider: String?
}

public struct MusicSuggestResponse: Decodable, Sendable {
    public let suggestions: [PlaylistSuggestion]
}
