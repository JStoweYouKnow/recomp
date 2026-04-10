import Foundation
import SwiftData

@Model
public final class UserProfile: @unchecked Sendable {
    @Attribute(.unique) var id: String
    public var name: String
    public var email: String?
    public var avatarDataUrl: String?
    public var age: Int
    public var weight: Double
    public var height: Double
    public var gender: Gender
    public var fitnessLevel: FitnessLevel
    public var goal: FitnessGoal
    public var dietaryRestrictions: [String]
    public var injuriesOrLimitations: [String]
    public var dailyActivityLevel: ActivityLevel
    public var unitSystem: MeasurementSystem
    public var workoutLocation: WorkoutLocation?
    public var workoutEquipment: [WorkoutEquipment]
    public var workoutDaysPerWeek: Int
    public var workoutTimeframe: WorkoutTimeframe?
    public var createdAt: Date
    public var lastSyncedAt: Date?

    public init(
        id: String = UUID().uuidString,
        name: String,
        email: String? = nil,
        avatarDataUrl: String? = nil,
        age: Int,
        weight: Double,
        height: Double,
        gender: Gender,
        fitnessLevel: FitnessLevel,
        goal: FitnessGoal,
        dietaryRestrictions: [String] = [],
        injuriesOrLimitations: [String] = [],
        dailyActivityLevel: ActivityLevel = .moderate,
        unitSystem: MeasurementSystem = .us,
        workoutLocation: WorkoutLocation? = nil,
        workoutEquipment: [WorkoutEquipment] = [],
        workoutDaysPerWeek: Int = 4,
        workoutTimeframe: WorkoutTimeframe? = nil,
        createdAt: Date = .now,
        lastSyncedAt: Date? = nil
    ) {
        self.id = id
        self.name = name
        self.email = email
        self.avatarDataUrl = avatarDataUrl
        self.age = age
        self.weight = weight
        self.height = height
        self.gender = gender
        self.fitnessLevel = fitnessLevel
        self.goal = goal
        self.dietaryRestrictions = dietaryRestrictions
        self.injuriesOrLimitations = injuriesOrLimitations
        self.dailyActivityLevel = dailyActivityLevel
        self.unitSystem = unitSystem
        self.workoutLocation = workoutLocation
        self.workoutEquipment = workoutEquipment
        self.workoutDaysPerWeek = workoutDaysPerWeek
        self.workoutTimeframe = workoutTimeframe
        self.createdAt = createdAt
        self.lastSyncedAt = lastSyncedAt
    }
}

public struct SignUpPayload: Codable, Sendable {
    let name: String
    public var email: String?
    public var password: String?
    let age: Int
    let weight: Double
    let height: Double
    let gender: String
    let fitnessLevel: String
    let goal: String
    let dietaryRestrictions: [String]
    let injuriesOrLimitations: [String]
    let dailyActivityLevel: String
    public var unitSystem: String?
    public var workoutLocation: String?
    public var workoutEquipment: [String]?
    public var workoutDaysPerWeek: Int?
    public var workoutTimeframe: String?
}
