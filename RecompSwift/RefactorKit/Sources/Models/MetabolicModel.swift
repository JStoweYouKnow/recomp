import Foundation
import SwiftData

public struct MetabolicDataPoint: Codable, Sendable {
    public var date: String
    public var weightKg: Double
    public var totalIntake: Double
    public var totalExpenditure: Double

    public init(date: String, weightKg: Double, totalIntake: Double, totalExpenditure: Double) {
        self.date = date
        self.weightKg = weightKg
        self.totalIntake = totalIntake
        self.totalExpenditure = totalExpenditure
    }
}

public struct MetabolicHistoryEntry: Codable, Sendable {
    public var date: String
    public var tdee: Double
    public var confidence: Double

    public init(date: String, tdee: Double, confidence: Double) {
        self.date = date
        self.tdee = tdee
        self.confidence = confidence
    }
}

@Model
public final class MetabolicModel: @unchecked Sendable {
    @Attribute(.unique) public var id: String
    public var estimatedTDEE: Double
    public var confidence: Double
    public var dataPoints: [MetabolicDataPoint]
    public var lastUpdated: Date
    public var history: [MetabolicHistoryEntry]

    public init(
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
