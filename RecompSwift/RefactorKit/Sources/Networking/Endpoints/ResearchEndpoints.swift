import Foundation

public enum ResearchAPI: APIEndpoint {
    case search(query: String)

    public var path: String { "/api/research" }
    public var method: HTTPMethod { .GET }

    public var queryItems: [URLQueryItem]? {
        switch self {
        case .search(let query):
            return [URLQueryItem(name: "q", value: query)]
        }
    }
}

public struct ResearchResponse: Decodable {
    public let answer: String
    public let sources: [ResearchSource]?
}

public struct ResearchSource: Decodable, Identifiable {
    public var id: String { url }
    public let title: String
    public let url: String
}
