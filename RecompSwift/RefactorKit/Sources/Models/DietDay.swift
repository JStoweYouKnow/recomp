import Foundation

public struct DietDayMeal: Codable, Identifiable, Hashable, Sendable {
    public var id: String { mealType + description }
    public var mealType: String
    public var description: String
    public var macros: Macros

    public init(mealType: String, description: String, macros: Macros) {
        self.mealType = mealType
        self.description = description
        self.macros = macros
    }
}

public struct DietDay: Codable, Identifiable, Hashable, Sendable {
    public var id: String { day }
    public var day: String
    public var meals: [DietDayMeal]

    public var totalMacros: Macros {
        meals.reduce(.zero) { $0.adding($1.macros) }
    }
}
