import Foundation

public enum MealAPI: APIEndpoint {
    case suggest(profile: UserProfileDTO, date: String)
    case analyzePhoto
    case analyzeReceipt
    case analyzeMenu
    case lookupNutritionWeb(query: String)
    case parseRecipeUrl(url: String)
    case saveRecipeFromUrl(url: String)
    case recipeSuggest(payload: RecipeSuggestPayload)
    case smartSuggest(payload: SmartSuggestPayload)
    case generatePlan(payload: MealPlanPayload)

    public var path: String {
        switch self {
        case .suggest: return "/api/meals/suggest"
        case .analyzePhoto: return "/api/meals/analyze-photo"
        case .analyzeReceipt: return "/api/meals/analyze-receipt"
        case .analyzeMenu: return "/api/meals/analyze-menu"
        case .lookupNutritionWeb: return "/api/meals/lookup-nutrition-web"
        case .parseRecipeUrl: return "/api/meals/parse-recipe-url"
        case .saveRecipeFromUrl: return "/api/recipes/save-from-url"
        case .recipeSuggest: return "/api/recipes/suggest"
        case .smartSuggest: return "/api/meals/smart-suggest"
        case .generatePlan: return "/api/meals/generate-plan"
        }
    }

    public var method: HTTPMethod { .POST }

    public var body: (any Encodable)? {
        switch self {
        case .suggest(let profile, let date):
            return AnyEncodable(MealSuggestPayload(profile: profile, date: date))
        case .lookupNutritionWeb(let query):
            return AnyEncodable(["query": query])
        case .parseRecipeUrl(let url):
            return AnyEncodable(["url": url])
        case .saveRecipeFromUrl(let url):
            return AnyEncodable(["url": url])
        case .recipeSuggest(let payload):
            return AnyEncodable(payload)
        case .smartSuggest(let payload):
            return AnyEncodable(payload)
        case .generatePlan(let payload):
            return AnyEncodable(payload)
        default:
            return nil
        }
    }
}

public struct MealSuggestPayload: Encodable {
    let profile: UserProfileDTO
    let date: String
}

public struct SmartSuggestPayload: Encodable {
    let profile: UserProfileDTO
    let recentMeals: [String]
    let pantryItems: [String]?
    let date: String
}

public struct MealPlanPayload: Encodable {
    let profile: UserProfileDTO
    let preferences: [String: String]?
}

public struct MealSuggestionResponse: Decodable {
    public let suggestions: [SuggestedMeal]
}

public struct SuggestedMeal: Decodable, Identifiable {
    public var id: String { name }
    public let name: String
    public let description: String?
    public let macros: Macros
    public let mealType: String?
}

public struct PhotoAnalysisResponse: Decodable {
    public let meals: [SuggestedMeal]
}

public struct NutritionLookupResponse: Decodable {
    public let name: String
    public let macros: Macros
    public let confidence: String?
    public let source: String?
}

public struct RecipeParseResponse: Decodable {
    public let name: String
    public let servings: Int?
    public let macros: Macros
    public let ingredients: [String]?
}

public struct RecipeSuggestPayload: Encodable {
    public let macroTargets: Macros
    public let todayMacros: Macros
    public let goal: String?
    public let mealType: String?
    public let includeDiscover: Bool

    public init(
        macroTargets: Macros,
        todayMacros: Macros,
        goal: String? = nil,
        mealType: String? = nil,
        includeDiscover: Bool = true
    ) {
        self.macroTargets = macroTargets
        self.todayMacros = todayMacros
        self.goal = goal
        self.mealType = mealType
        self.includeDiscover = includeDiscover
    }
}

public struct ScoredRecipeSuggestion: Decodable, Identifiable {
    public var id: String
    public let name: String
    public let calories: Int
    public let protein: Int
    public let carbs: Int
    public let fat: Int
    public let recipeUrl: String?
    public let source: String?
    public let fitScore: Int
    public let fitReason: String
}

public struct RecipeSuggestResponse: Decodable {
    public let suggestions: [ScoredRecipeSuggestion]
}

public struct RecipeSaveResponse: Decodable {
    public let recipe: SavedRecipeDTO
    public let savedCount: Int
}
