import Foundation
import SwiftData

@Model
final class UserProfile: @unchecked Sendable {
    @Attribute(.unique) var id: String
    var name: String
    var email: String?
    var avatarDataUrl: String?
    var age: Int
    var weight: Double
    var height: Double
    var gender: Gender
    var fitnessLevel: FitnessLevel
    var goal: FitnessGoal
    var dietaryRestrictions: [String]
    var injuriesOrLimitations: [String]
    var dailyActivityLevel: ActivityLevel
    var unitSystem: MeasurementSystem
    var workoutLocation: WorkoutLocation?
    var workoutEquipment: [WorkoutEquipment]
    var workoutDaysPerWeek: Int
    var workoutTimeframe: WorkoutTimeframe?
    var createdAt: Date
    var lastSyncedAt: Date?

    init(
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

struct SignUpPayload: Codable, Sendable {
    let name: String
    var email: String?
    var password: String?
    let age: Int
    let weight: Double
    let height: Double
    let gender: String
    let fitnessLevel: String
    let goal: String
    let dietaryRestrictions: [String]
    let injuriesOrLimitations: [String]
    let dailyActivityLevel: String
    var unitSystem: String?
    var workoutLocation: String?
    var workoutEquipment: [String]?
    var workoutDaysPerWeek: Int?
    var workoutTimeframe: String?
}
