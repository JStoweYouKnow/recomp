import Foundation

/// `POST /api/agent/weekly-review` only (no GET).
/// Uses `WeeklyReviewGeneratePayload` defined in PushEndpoints.swift.
public enum WeeklyReviewAPI: APIEndpoint {
    case generate(payload: WeeklyReviewGeneratePayload)

    public var path: String { "/api/agent/weekly-review" }
    public var method: HTTPMethod { .POST }

    public var body: (any Encodable)? {
        switch self {
        case .generate(let payload):
            return AnyEncodable(payload)
        }
    }
}
