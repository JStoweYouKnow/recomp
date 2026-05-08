import Foundation
import SwiftData

@Model
public final class WearableConnection: @unchecked Sendable {
    @Attribute(.unique) public var id: String
    public var provider: WearableProvider
    public var connectedAt: Date
    public var label: String?

    public init(provider: WearableProvider, connectedAt: Date = .now, label: String? = nil) {
        self.id = provider.rawValue
        self.provider = provider
        self.connectedAt = connectedAt
        self.label = label
    }
}

@Model
public final class WearableDaySummary: @unchecked Sendable {
    @Attribute(.unique) public var id: String
    public var date: String
    public var provider: WearableProvider
    public var steps: Int?
    public var caloriesBurned: Double?
    public var activeMinutes: Int?
    public var sleepScore: Int?
    public var sleepDuration: Int?
    public var readinessScore: Int?
    public var heartRateAvg: Int?
    public var heartRateResting: Int?
    /// Body mass **in pounds**. Matches `/api/data/sync` and `WearableDaySummaryDTO` (`sync-schema`).
    /// Use ``WearableMassStoredPounds.weightKg(fromStoredPounds:)`` where you need kg.
    public var weight: Double?
    public var bodyFatPercent: Double?
    /// Muscle mass **in pounds** (same sync contract as `weight`).
    public var muscleMass: Double?
    public var bmi: Double?
    public var bmr: Double?
    public var metabolicAge: Int?

    public init(
        date: String,
        provider: WearableProvider,
        steps: Int? = nil,
        caloriesBurned: Double? = nil,
        activeMinutes: Int? = nil,
        sleepScore: Int? = nil,
        sleepDuration: Int? = nil,
        heartRateAvg: Int? = nil,
        heartRateResting: Int? = nil,
        weight: Double? = nil,
        bodyFatPercent: Double? = nil,
        muscleMass: Double? = nil
    ) {
        self.id = "\(date)_\(provider.rawValue)"
        self.date = date
        self.provider = provider
        self.steps = steps
        self.caloriesBurned = caloriesBurned
        self.activeMinutes = activeMinutes
        self.sleepScore = sleepScore
        self.sleepDuration = sleepDuration
        self.heartRateAvg = heartRateAvg
        self.heartRateResting = heartRateResting
        self.weight = weight
        self.bodyFatPercent = bodyFatPercent
        self.muscleMass = muscleMass
    }
}

public struct MeasurementTargets: Codable, Sendable {
    public var targetWeightLbs: Double?
    public var targetBodyFatPercent: Double?
    public var targetMuscleMassLbs: Double?

    public init(
        targetWeightLbs: Double? = nil,
        targetBodyFatPercent: Double? = nil,
        targetMuscleMassLbs: Double? = nil
    ) {
        self.targetWeightLbs = targetWeightLbs
        self.targetBodyFatPercent = targetBodyFatPercent
        self.targetMuscleMassLbs = targetMuscleMassLbs
    }
}
