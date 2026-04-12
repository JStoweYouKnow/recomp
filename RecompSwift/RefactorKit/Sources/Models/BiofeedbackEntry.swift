import Foundation
import SwiftData

@Model
public final class BiofeedbackEntry: @unchecked Sendable {
    @Attribute(.unique) public var id: String
    public var date: String
    public var time: String
    public var energy: Int
    public var mood: Int
    public var hunger: Int
    public var stress: Int
    public var soreness: Int
    public var notes: String?

    public init(
        id: String = UUID().uuidString,
        date: String,
        time: String,
        energy: Int,
        mood: Int,
        hunger: Int,
        stress: Int,
        soreness: Int,
        notes: String? = nil
    ) {
        self.id = id
        self.date = date
        self.time = time
        self.energy = energy
        self.mood = mood
        self.hunger = hunger
        self.stress = stress
        self.soreness = soreness
        self.notes = notes
    }
}

public struct BiofeedbackInsight: Codable, Sendable {
    public struct Correlation: Codable, Sendable {
        public var factor: String
        public var observation: String
        public var strength: ConfidenceLevel

        public init(factor: String, observation: String, strength: ConfidenceLevel) {
            self.factor = factor
            self.observation = observation
            self.strength = strength
        }
    }

    public var correlations: [Correlation]
    public var recommendations: [String]
    public var generatedAt: String
}
