import Foundation
import SwiftData

@Model
public final class SocialSettings: @unchecked Sendable {
    @Attribute(.unique) var id: String
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

public struct WeeklyReview: Codable, Identifiable, Sendable {
    public var id: String
    public var createdAt: String
    public var summary: String
    public var mealAnalysis: String
    public var wearableInsights: String
    public var recommendations: [String]
    public var reasoning: String
    public var agentSteps: [AgentStep]

    struct AgentStep: Codable, Sendable {
        var tool: String
        var summary: String
    }
}

public struct RecoveryAssessment: Codable, Sendable {
    public var score: Double
    public var level: RecoveryLevel
    public var factors: [Factor]
    public var recommendation: String
    public var modifiedWorkout: ModifiedWorkout?

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
public final class PantryItem: @unchecked Sendable {
    @Attribute(.unique) var id: String
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

    struct Ingredient: Codable, Sendable {
        var name: String
        var amount: String
        var category: String
    }
}

@Model
public final class MealPrepPlan: @unchecked Sendable {
    @Attribute(.unique) var id: String
    public var weekStart: String
    public var recipes: [MealPrepRecipe]
    public var groceryList: [GroceryItem]
    public var batchInstructions: [String]
    public var estimatedPrepTime: Int
    public var createdAt: Date

    struct GroceryItem: Codable, Sendable {
        var item: String
        var amount: String
        var category: String
        var checked: Bool
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
