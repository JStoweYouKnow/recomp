import Foundation
import SwiftData

@Model
public final class MealEntry: @unchecked Sendable {
    @Attribute(.unique) var id: String
    public var date: String
    public var mealType: MealType
    public var name: String
    public var macros: Macros
    public var notes: String?
    public var imageUrl: String?
    public var loggedAt: Date
    public var synced: Bool

    public init(
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
