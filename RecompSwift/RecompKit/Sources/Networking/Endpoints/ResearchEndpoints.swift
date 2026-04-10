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
    let answer: String
    let sources: [ResearchSource]?
}

public struct ResearchSource: Decodable, Identifiable {
    public var id: String { url }
    let title: String
    let url: String
}
