import Foundation
import SwiftData

@Model
final class ActivityLogEntry: @unchecked Sendable {
    @Attribute(.unique) var id: String
    var date: String
    var entryType: String
    var label: String
    var category: ActivityCategory
    var durationMinutes: Int
    var calorieAdjustment: Int
    var loggedAt: Date

    init(
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
        self.category = category
        self.durationMinutes = durationMinutes
        self.calorieAdjustment = calorieAdjustment
        self.loggedAt = loggedAt
    }
}
