import Foundation
import SwiftData

@Model
public final class BiofeedbackEntry: @unchecked Sendable {
    @Attribute(.unique) var id: String
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
    struct Correlation: Codable, Sendable {
        var factor: String
        var observation: String
        var strength: ConfidenceLevel
    }

    public var correlations: [Correlation]
    public var recommendations: [String]
    public var generatedAt: String
}
