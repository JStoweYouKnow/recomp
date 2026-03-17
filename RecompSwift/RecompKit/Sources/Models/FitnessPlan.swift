import Foundation
import SwiftData

@Model
final class FitnessPlan: @unchecked Sendable {
    @Attribute(.unique) var id: String
    var userId: String
    var createdAt: Date
    var dietPlan: DietPlan
    var workoutPlan: WorkoutPlan
    var reasoning: String?
    var synced: Bool

    init(
        id: String = UUID().uuidString,
        userId: String,
        createdAt: Date = .now,
        dietPlan: DietPlan,
        workoutPlan: WorkoutPlan,
        reasoning: String? = nil,
        synced: Bool = false
    ) {
        self.id = id
        self.userId = userId
        self.createdAt = createdAt
        self.dietPlan = dietPlan
        self.workoutPlan = workoutPlan
        self.reasoning = reasoning
        self.synced = synced
    }
}

struct DietPlan: Codable, Sendable {
    var dailyTargets: Macros
    var weeklyPlan: [DietDay]
    var tips: [String]
}

struct WorkoutPlan: Codable, Sendable {
    var weeklyPlan: [WorkoutDay]
    var tips: [String]
}
