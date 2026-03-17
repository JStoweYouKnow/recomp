import Foundation
import SwiftData

struct MetabolicDataPoint: Codable, Sendable {
    var date: String
    var weightKg: Double
    var totalIntake: Double
    var totalExpenditure: Double
}

struct MetabolicHistoryEntry: Codable, Sendable {
    var date: String
    var tdee: Double
    var confidence: Double
}

@Model
final class MetabolicModel: @unchecked Sendable {
    @Attribute(.unique) var id: String
    var estimatedTDEE: Double
    var confidence: Double
    var dataPoints: [MetabolicDataPoint]
    var lastUpdated: Date
    var history: [MetabolicHistoryEntry]

    init(
        id: String = "metabolic",
        estimatedTDEE: Double = 2000,
        confidence: Double = 0,
        dataPoints: [MetabolicDataPoint] = [],
        lastUpdated: Date = .now,
        history: [MetabolicHistoryEntry] = []
    ) {
        self.id = id
        self.estimatedTDEE = estimatedTDEE
        self.confidence = confidence
        self.dataPoints = dataPoints
        self.lastUpdated = lastUpdated
        self.history = history
    }
}
