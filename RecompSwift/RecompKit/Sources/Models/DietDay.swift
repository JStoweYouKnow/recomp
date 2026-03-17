import Foundation

struct DietDayMeal: Codable, Identifiable, Hashable, Sendable {
    var id: String { mealType + description }
    var mealType: String
    var description: String
    var macros: Macros
}

struct DietDay: Codable, Identifiable, Hashable, Sendable {
    var id: String { day }
    var day: String
    var meals: [DietDayMeal]

    var totalMacros: Macros {
        meals.reduce(.zero) { $0.adding($1.macros) }
    }
}
