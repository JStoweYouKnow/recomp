import Foundation
import SwiftData

@Model
public final class FitnessPlan: @unchecked Sendable {
    @Attribute(.unique) public var id: String
    public var userId: String
    public var createdAt: Date
    public var dietPlan: DietPlan
    public var workoutPlan: WorkoutPlan
    public var reasoning: String?
    public var synced: Bool

    public init(
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

public struct DietPlan: Codable, Sendable {
    public var dailyTargets: Macros
    public var trainingTargets: Macros?
    public var restTargets: Macros?
    public var weeklyPlan: [DietDay]
    public var tips: [String]
}

public struct WorkoutPlan: Codable, Sendable {
    public var weeklyPlan: [WorkoutDay]
    public var tips: [String]
    /// `yyyy-MM-dd` anchor for multi-week PDF plans (program week 1); matches web `programWeek1Start`.
    public var programWeek1Start: String?

    public init(weeklyPlan: [WorkoutDay], tips: [String], programWeek1Start: String? = nil) {
        self.weeklyPlan = weeklyPlan
        self.tips = tips
        self.programWeek1Start = programWeek1Start
    }
}
