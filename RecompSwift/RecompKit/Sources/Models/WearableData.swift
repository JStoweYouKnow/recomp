import Foundation
import SwiftData

@Model
final class WearableConnection: @unchecked Sendable {
    @Attribute(.unique) var id: String
    var provider: WearableProvider
    var connectedAt: Date
    var label: String?

    init(provider: WearableProvider, connectedAt: Date = .now, label: String? = nil) {
        self.id = provider.rawValue
        self.provider = provider
        self.connectedAt = connectedAt
        self.label = label
    }
}

@Model
final class WearableDaySummary: @unchecked Sendable {
    @Attribute(.unique) var id: String
    var date: String
    var provider: WearableProvider
    var steps: Int?
    var caloriesBurned: Double?
    var activeMinutes: Int?
    var sleepScore: Int?
    var sleepDuration: Int?
    var readinessScore: Int?
    var heartRateAvg: Int?
    var heartRateResting: Int?
    var weight: Double?
    var bodyFatPercent: Double?
    var muscleMass: Double?
    var bmi: Double?
    var bmr: Double?
    var metabolicAge: Int?

    init(
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

struct MeasurementTargets: Codable, Sendable {
    var targetWeightLbs: Double?
    var targetBodyFatPercent: Double?
    var targetMuscleMassLbs: Double?
}
