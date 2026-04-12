import Foundation

public struct Macros: Codable, Hashable, Sendable {
    public var calories: Int
    public var protein: Double
    public var carbs: Double
    public var fat: Double

    public init(calories: Int, protein: Double, carbs: Double, fat: Double) {
        self.calories = calories
        self.protein = protein
        self.carbs = carbs
        self.fat = fat
    }

    public static let zero = Macros(calories: 0, protein: 0, carbs: 0, fat: 0)

    public func adding(_ other: Macros) -> Macros {
        Macros(
            calories: calories + other.calories,
            protein: protein + other.protein,
            carbs: carbs + other.carbs,
            fat: fat + other.fat
        )
    }

    public func remaining(from target: Macros) -> Macros {
        Macros(
            calories: target.calories - calories,
            protein: target.protein - protein,
            carbs: target.carbs - carbs,
            fat: target.fat - fat
        )
    }

    public var proteinCalories: Double { protein * 4 }
    public var carbCalories: Double { carbs * 4 }
    public var fatCalories: Double { fat * 9 }
}
