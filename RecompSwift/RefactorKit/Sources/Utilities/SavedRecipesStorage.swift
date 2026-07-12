import Foundation

/// Synced recipe library stored in the App Group suite (parity with web `savedRecipes`).
public struct SavedRecipeRecord: Codable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var description: String?
    public var calories: Int
    public var protein: Int
    public var carbs: Int
    public var fat: Int
    public var recipeUrl: String?
    public var source: String?
    public var mealTypes: [String]?
    public var servings: Int?
    public var addedAt: String

    public init(
        id: String,
        name: String,
        description: String? = nil,
        calories: Int,
        protein: Int,
        carbs: Int,
        fat: Int,
        recipeUrl: String? = nil,
        source: String? = nil,
        mealTypes: [String]? = nil,
        servings: Int? = nil,
        addedAt: String
    ) {
        self.id = id
        self.name = name
        self.description = description
        self.calories = calories
        self.protein = protein
        self.carbs = carbs
        self.fat = fat
        self.recipeUrl = recipeUrl
        self.source = source
        self.mealTypes = mealTypes
        self.servings = servings
        self.addedAt = addedAt
    }
}

public enum SavedRecipesStorage {
    public static func load() -> [SavedRecipeRecord] {
        guard let data = RecompAppGroupDefaults.shared.data(forKey: RecompUserDefaultsKeys.savedRecipesJSON),
              let decoded = try? JSONDecoder().decode([SavedRecipeRecord].self, from: data) else {
            return []
        }
        return decoded
    }

    public static func save(_ recipes: [SavedRecipeRecord]) {
        guard let data = try? JSONEncoder().encode(recipes) else { return }
        RecompAppGroupDefaults.shared.set(data, forKey: RecompUserDefaultsKeys.savedRecipesJSON)
    }

    public static func append(_ recipe: SavedRecipeRecord) {
        var list = load()
        list.removeAll {
            ($0.recipeUrl ?? "").lowercased() == (recipe.recipeUrl ?? "").lowercased()
                && !(recipe.recipeUrl ?? "").isEmpty
        }
        list.insert(recipe, at: 0)
        save(Array(list.prefix(500)))
    }
}
