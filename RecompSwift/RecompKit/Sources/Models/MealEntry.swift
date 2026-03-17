import Foundation
import SwiftData

@Model
final class MealEntry: @unchecked Sendable {
    @Attribute(.unique) var id: String
    var date: String
    var mealType: MealType
    var name: String
    var macros: Macros
    var notes: String?
    var imageUrl: String?
    var loggedAt: Date
    var synced: Bool

    init(
        id: String = UUID().uuidString,
        date: String,
        mealType: MealType,
        name: String,
        macros: Macros,
        notes: String? = nil,
        imageUrl: String? = nil,
        loggedAt: Date = .now,
        synced: Bool = false
    ) {
        self.id = id
        self.date = date
        self.mealType = mealType
        self.name = name
        self.macros = macros
        self.notes = notes
        self.imageUrl = imageUrl
        self.loggedAt = loggedAt
        self.synced = synced
    }
}
