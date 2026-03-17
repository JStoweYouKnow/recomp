import Foundation

enum MealAPI: APIEndpoint {
    case suggest(profile: UserProfileDTO, date: String)
    case analyzePhoto
    case analyzeReceipt
    case analyzeMenu
    case lookupNutritionWeb(query: String)
    case parseRecipeUrl(url: String)
    case smartSuggest(payload: SmartSuggestPayload)
    case generatePlan(payload: MealPlanPayload)

    var path: String {
        switch self {
        case .suggest: return "/api/meals/suggest"
        case .analyzePhoto: return "/api/meals/analyze-photo"
        case .analyzeReceipt: return "/api/meals/analyze-receipt"
        case .analyzeMenu: return "/api/meals/analyze-menu"
        case .lookupNutritionWeb: return "/api/meals/lookup-nutrition-web"
        case .parseRecipeUrl: return "/api/meals/parse-recipe-url"
        case .smartSuggest: return "/api/meals/smart-suggest"
        case .generatePlan: return "/api/meals/generate-plan"
        }
    }

    var method: HTTPMethod { .POST }

    var body: (any Encodable)? {
        switch self {
        case .suggest(let profile, let date):
            return AnyEncodable(MealSuggestPayload(profile: profile, date: date))
        case .lookupNutritionWeb(let query):
            return AnyEncodable(["query": query])
        case .parseRecipeUrl(let url):
            return AnyEncodable(["url": url])
        case .smartSuggest(let payload):
            return AnyEncodable(payload)
        case .generatePlan(let payload):
            return AnyEncodable(payload)
        default:
            return nil
        }
    }
}

struct MealSuggestPayload: Encodable {
    let profile: UserProfileDTO
    let date: String
}

struct SmartSuggestPayload: Encodable {
    let profile: UserProfileDTO
    let recentMeals: [String]
    let pantryItems: [String]?
    let date: String
}

struct MealPlanPayload: Encodable {
    let profile: UserProfileDTO
    let preferences: [String: String]?
}

struct MealSuggestionResponse: Decodable {
    let suggestions: [SuggestedMeal]
}

struct SuggestedMeal: Decodable, Identifiable {
    var id: String { name }
    let name: String
    let description: String?
    let macros: Macros
    let mealType: String?
}

struct PhotoAnalysisResponse: Decodable {
    let meals: [SuggestedMeal]
}

struct NutritionLookupResponse: Decodable {
    let name: String
    let macros: Macros
    let confidence: String?
    let source: String?
}

struct RecipeParseResponse: Decodable {
    let name: String
    let servings: Int?
    let macros: Macros
    let ingredients: [String]?
}
