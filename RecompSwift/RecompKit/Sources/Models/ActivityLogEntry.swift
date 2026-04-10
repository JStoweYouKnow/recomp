import Foundation
import SwiftData

@Model
public final class ActivityLogEntry: @unchecked Sendable {
    @Attribute(.unique) var id: String
    public var date: String
    public var entryType: String
    public var label: String
    public var categoryRawValue: String
    public var durationMinutes: Int
    public var calorieAdjustment: Int
    public var loggedAt: Date

    public var category: ActivityCategory {
        get {
            if let at = ActivityType(rawValue: categoryRawValue) {
                return .activity(at)
            } else if let st = SedentaryType(rawValue: categoryRawValue) {
                return .sedentary(st)
            }
            return .activity(.other)
        }
        set {
            switch newValue {
            case .activity(let t): categoryRawValue = t.rawValue
            case .sedentary(let t): categoryRawValue = t.rawValue
            }
        }
    }

    public init(
        id: String = UUID().uuidString,
        date: String,
        entryType: String,
        label: String,
        category: ActivityCategory,
        durationMinutes: Int,
        calorieAdjustment: Int,
        loggedAt: Date = .now
    ) {
        self.id = id
        self.date = date
        self.entryType = entryType
        self.label = label
        switch category {
        case .activity(let t): self.categoryRawValue = t.rawValue
        case .sedentary(let t): self.categoryRawValue = t.rawValue
        }
        self.durationMinutes = durationMinutes
        self.calorieAdjustment = calorieAdjustment
        self.loggedAt = loggedAt
    }
}
