import Foundation

struct Macros: Codable, Hashable, Sendable {
    var calories: Int
    var protein: Double
    var carbs: Double
    var fat: Double

    static let zero = Macros(calories: 0, protein: 0, carbs: 0, fat: 0)

    func adding(_ other: Macros) -> Macros {
        Macros(
            calories: calories + other.calories,
            protein: protein + other.protein,
            carbs: carbs + other.carbs,
            fat: fat + other.fat
        )
    }

    func remaining(from target: Macros) -> Macros {
        Macros(
            calories: target.calories - calories,
            protein: target.protein - protein,
            carbs: target.carbs - carbs,
            fat: target.fat - fat
        )
    }

    var proteinCalories: Double { protein * 4 }
    var carbCalories: Double { carbs * 4 }
    var fatCalories: Double { fat * 9 }
}
