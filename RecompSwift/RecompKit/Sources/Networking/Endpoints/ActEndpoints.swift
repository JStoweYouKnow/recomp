import Foundation

public enum ActAPI: APIEndpoint {
    case grocery(items: [String])
    case nutrition(food: String)
    case status
    case sync

    public var path: String {
        switch self {
        case .grocery: return "/api/act/grocery"
        case .nutrition: return "/api/act/nutrition"
        case .status: return "/api/act/status"
        case .sync: return "/api/act/sync"
        }
    }

    public var method: HTTPMethod {
        switch self {
        case .status: return .GET
        default: return .POST
        }
    }

    public var body: (any Encodable)? {
        switch self {
        case .grocery(let items): return AnyEncodable(["items": items])
        case .nutrition(let food): return AnyEncodable(["food": food])
        default: return nil
        }
    }
}

public struct GrocerySearchResult: Decodable, Identifiable {
    public var id: String { title }
    let title: String
    let price: String?
    let url: String
    let imageUrl: String?
}

public struct GroceryResponse: Decodable {
    let results: [GrocerySearchResult]?
    let fallbackUrl: String?
}

public struct NutritionResponse: Decodable {
    let food: String
    let macros: Macros?
    let source: String?
}
