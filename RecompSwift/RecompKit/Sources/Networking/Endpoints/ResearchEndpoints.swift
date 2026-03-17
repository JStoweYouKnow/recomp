import Foundation

enum ResearchAPI: APIEndpoint {
    case search(query: String)

    var path: String { "/api/research" }
    var method: HTTPMethod { .GET }

    var queryItems: [URLQueryItem]? {
        switch self {
        case .search(let query):
            return [URLQueryItem(name: "q", value: query)]
        }
    }
}

struct ResearchResponse: Decodable {
    let answer: String
    let sources: [ResearchSource]?
}

struct ResearchSource: Decodable, Identifiable {
    var id: String { url }
    let title: String
    let url: String
}
