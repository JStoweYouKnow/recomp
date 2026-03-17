import Foundation
import SwiftData

@Model
final class SocialSettings: @unchecked Sendable {
    @Attribute(.unique) var id: String
    var visibility: ProfileVisibility
    var username: String?

    init(
        id: String = "social",
        visibility: ProfileVisibility = .badgesOnly,
        username: String? = nil
    ) {
        self.id = id
        self.visibility = visibility
        self.username = username
    }
}

struct PublicProfile: Codable, Sendable {
    var username: String
    var name: String
    var avatarDataUrl: String?
    var goal: FitnessGoal
    var visibility: ProfileVisibility
    var badges: [MilestoneDTO]
    var xp: Int
    var xpLevel: Int
    var streakLength: Int?
    var weeksActive: Int?
    var macroHitRate: Double?
    var recentMeals: [RecentMealDTO]?
    var workoutCompletionRate: Double?

    struct MilestoneDTO: Codable, Sendable {
        var id: String
        var earnedAt: String
        var progress: Double?
    }

    struct RecentMealDTO: Codable, Sendable {
        var date: String
        var name: String
        var macros: Macros
    }
}

struct WeeklyReview: Codable, Identifiable, Sendable {
    var id: String
    var createdAt: String
    var summary: String
    var mealAnalysis: String
    var wearableInsights: String
    var recommendations: [String]
    var reasoning: String
    var agentSteps: [AgentStep]

    struct AgentStep: Codable, Sendable {
        var tool: String
        var summary: String
    }
}

struct RecoveryAssessment: Codable, Sendable {
    var score: Double
    var level: RecoveryLevel
    var factors: [Factor]
    var recommendation: String
    var modifiedWorkout: ModifiedWorkout?

    struct Factor: Codable, Sendable {
        var name: String
        var impact: ImpactType
        var value: String?
    }

    struct ModifiedWorkout: Codable, Sendable {
        var volumeAdjustment: Double
        var intensityAdjustment: Double
        var suggestedSwaps: [Swap]

        struct Swap: Codable, Sendable {
            var original: String
            var replacement: String
            var reason: String
        }
    }
}

@Model
final class PantryItem: @unchecked Sendable {
    @Attribute(.unique) var id: String
    var name: String
    var category: PantryCategory
    var addedAt: Date
    var expiresAt: Date?

    init(
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

struct MealPrepRecipe: Codable, Identifiable, Sendable {
    var id: String { name }
    var name: String
    var servings: Int
    var macrosPerServing: Macros
    var ingredients: [Ingredient]
    var instructions: [String]
    var prepTime: Int
    var cookTime: Int

    struct Ingredient: Codable, Sendable {
        var name: String
        var amount: String
        var category: String
    }
}

@Model
final class MealPrepPlan: @unchecked Sendable {
    @Attribute(.unique) var id: String
    var weekStart: String
    var recipes: [MealPrepRecipe]
    var groceryList: [GroceryItem]
    var batchInstructions: [String]
    var estimatedPrepTime: Int
    var createdAt: Date

    struct GroceryItem: Codable, Sendable {
        var item: String
        var amount: String
        var category: String
        var checked: Bool
    }

    init(
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

struct CookingAppConnection: Codable, Sendable {
    var provider: CookingAppProvider
    var label: String?
    var connectedAt: String
}

struct MusicPreference: Codable, Sendable {
    var provider: MusicProvider
    var workoutPlaylists: [String: String]
}

struct PlaylistSuggestion: Codable, Identifiable, Sendable {
    var id: String { deepLink }
    var name: String
    var description: String
    var provider: MusicProvider
    var deepLink: String
    var bpm: String
    var mood: String
}
