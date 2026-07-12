import Foundation
import SwiftData

@Model
public final class SocialSettings: @unchecked Sendable {
    @Attribute(.unique) public var id: String
    public var visibility: ProfileVisibility
    public var username: String?

    public init(
        id: String = "social",
        visibility: ProfileVisibility = .badgesOnly,
        username: String? = nil
    ) {
        self.id = id
        self.visibility = visibility
        self.username = username
    }
}

public struct PublicProfile: Codable, Sendable {
    public var username: String
    public var name: String
    public var avatarDataUrl: String?
    public var goal: FitnessGoal
    public var visibility: ProfileVisibility
    public var badges: [MilestoneDTO]
    public var xp: Int
    public var xpLevel: Int
    public var streakLength: Int?
    public var weeksActive: Int?
    public var macroHitRate: Double?
    public var recentMeals: [RecentMealDTO]?
    public var workoutCompletionRate: Double?

    public struct MilestoneDTO: Codable, Sendable {
        public var id: String
        public var earnedAt: String
        public var progress: Double?

        public init(id: String, earnedAt: String, progress: Double? = nil) {
            self.id = id
            self.earnedAt = earnedAt
            self.progress = progress
        }
    }

    public struct RecentMealDTO: Codable, Sendable {
        public var date: String
        public var name: String
        public var macros: Macros

        public init(date: String, name: String, macros: Macros) {
            self.date = date
            self.name = name
            self.macros = macros
        }
    }
}

public struct WeeklyReview: Codable, Identifiable, Sendable {
    public var id: String
    public var createdAt: String
    public var summary: String
    public var mealAnalysis: String
    public var wearableInsights: String
    public var recommendations: [String]
    public var reasoning: String
    public var weeklyScore: Int?
    public var agentSteps: [AgentStep]

    public struct AgentStep: Codable, Sendable {
        public var agent: String?
        public var tool: String
        public var summary: String

        public init(agent: String? = nil, tool: String, summary: String) {
            self.agent = agent
            self.tool = tool
            self.summary = summary
        }
    }
}

public struct RecoveryAssessment: Codable, Sendable {
    public var score: Double
    public var level: RecoveryLevel
    public var factors: [Factor]
    public var recommendation: String
    public var modifiedWorkout: ModifiedWorkout?

    public struct Factor: Codable, Sendable {
        public var name: String
        public var impact: ImpactType
        public var value: String?

        public init(name: String, impact: ImpactType, value: String? = nil) {
            self.name = name
            self.impact = impact
            self.value = value
        }
    }

    public struct ModifiedWorkout: Codable, Sendable {
        public var volumeAdjustment: Double
        public var intensityAdjustment: Double
        public var suggestedSwaps: [Swap]

        public init(volumeAdjustment: Double, intensityAdjustment: Double, suggestedSwaps: [Swap]) {
            self.volumeAdjustment = volumeAdjustment
            self.intensityAdjustment = intensityAdjustment
            self.suggestedSwaps = suggestedSwaps
        }

        public struct Swap: Codable, Sendable {
            public var original: String
            public var replacement: String
            public var reason: String

            public init(original: String, replacement: String, reason: String) {
                self.original = original
                self.replacement = replacement
                self.reason = reason
            }
        }
    }
}

@Model
public final class PantryItem: @unchecked Sendable {
    @Attribute(.unique) public var id: String
    public var name: String
    public var category: PantryCategory
    public var addedAt: Date
    public var expiresAt: Date?

    public init(
        id: String = UUID().uuidString,
        name: String,
        category: PantryCategory,
        addedAt: Date = .now,
        expiresAt: Date? = nil
    ) {
        self.id = id
        self.name = name
        self.category = category
        self.addedAt = addedAt
        self.expiresAt = expiresAt
    }
}

public struct MealPrepRecipe: Codable, Identifiable, Sendable {
    public var id: String { name }
    public var name: String
    public var servings: Int
    public var macrosPerServing: Macros
    public var ingredients: [Ingredient]
    public var instructions: [String]
    public var prepTime: Int
    public var cookTime: Int

    public init(
        name: String,
        servings: Int,
        macrosPerServing: Macros,
        ingredients: [Ingredient],
        instructions: [String],
        prepTime: Int,
        cookTime: Int
    ) {
        self.name = name
        self.servings = servings
        self.macrosPerServing = macrosPerServing
        self.ingredients = ingredients
        self.instructions = instructions
        self.prepTime = prepTime
        self.cookTime = cookTime
    }

    public struct Ingredient: Codable, Sendable {
        public var name: String
        public var amount: String
        public var category: String

        public init(name: String, amount: String, category: String) {
            self.name = name
            self.amount = amount
            self.category = category
        }
    }
}

@Model
public final class MealPrepPlan: @unchecked Sendable {
    @Attribute(.unique) public var id: String
    public var weekStart: String
    public var recipes: [MealPrepRecipe]
    public var groceryList: [GroceryItem]
    public var batchInstructions: [String]
    public var estimatedPrepTime: Int
    public var createdAt: Date

    public struct GroceryItem: Codable, Equatable, Sendable {
        public var item: String
        public var amount: String
        public var category: String
        public var checked: Bool

        public init(item: String, amount: String, category: String, checked: Bool) {
            self.item = item
            self.amount = amount
            self.category = category
            self.checked = checked
        }
    }

    public init(
        id: String = UUID().uuidString,
        weekStart: String,
        recipes: [MealPrepRecipe] = [],
        groceryList: [GroceryItem] = [],
        batchInstructions: [String] = [],
        estimatedPrepTime: Int = 0,
        createdAt: Date = .now
    ) {
        self.id = id
        self.weekStart = weekStart
        self.recipes = recipes
        self.groceryList = groceryList
        self.batchInstructions = batchInstructions
        self.estimatedPrepTime = estimatedPrepTime
        self.createdAt = createdAt
    }
}

public struct CookingAppConnection: Codable, Sendable {
    public var provider: CookingAppProvider
    public var label: String?
    public var connectedAt: String
}

public struct MusicPreference: Codable, Sendable {
    public var provider: MusicProvider
    public var workoutPlaylists: [String: String]
}

public struct PlaylistSuggestion: Codable, Identifiable, Sendable {
    public var id: String { deepLink }
    public var name: String
    public var description: String
    public var provider: MusicProvider
    public var deepLink: String
    public var bpm: String
    public var mood: String
}
