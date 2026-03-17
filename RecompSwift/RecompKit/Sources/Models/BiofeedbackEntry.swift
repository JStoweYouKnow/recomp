import Foundation
import SwiftData

@Model
final class BiofeedbackEntry: @unchecked Sendable {
    @Attribute(.unique) var id: String
    var date: String
    var time: String
    var energy: Int
    var mood: Int
    var hunger: Int
    var stress: Int
    var soreness: Int
    var notes: String?

    init(
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

struct BiofeedbackInsight: Codable, Sendable {
    struct Correlation: Codable, Sendable {
        var factor: String
        var observation: String
        var strength: ConfidenceLevel
    }

    var correlations: [Correlation]
    var recommendations: [String]
    var generatedAt: String
}
