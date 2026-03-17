import Foundation

enum ActAPI: APIEndpoint {
    case grocery(items: [String])
    case nutrition(food: String)
    case status
    case sync

    var path: String {
        switch self {
        case .grocery: return "/api/act/grocery"
        case .nutrition: return "/api/act/nutrition"
        case .status: return "/api/act/status"
        case .sync: return "/api/act/sync"
        }
    }

    var method: HTTPMethod {
        switch self {
        case .status: return .GET
        default: return .POST
        }
    }

    var body: (any Encodable)? {
        switch self {
        case .grocery(let items): return AnyEncodable(["items": items])
        case .nutrition(let food): return AnyEncodable(["food": food])
        default: return nil
        }
    }
}

struct GrocerySearchResult: Decodable, Identifiable {
    var id: String { title }
    let title: String
    let price: String?
    let url: String
    let imageUrl: String?
}

struct GroceryResponse: Decodable {
    let results: [GrocerySearchResult]?
    let fallbackUrl: String?
}

struct NutritionResponse: Decodable {
    let food: String
    let macros: Macros?
    let source: String?
}
