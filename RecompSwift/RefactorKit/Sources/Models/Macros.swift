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

    // The server marks all macro fields as optional (z.number().optional()) and the AI
    // may return them as floats (e.g. 1850.5). Use decodeIfPresent + Double to handle
    // both cases: missing fields default to 0, floats are rounded to Int for calories.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        calories = Int((try c.decodeIfPresent(Double.self, forKey: .calories) ?? 0).rounded())
        protein  = try c.decodeIfPresent(Double.self, forKey: .protein) ?? 0
        carbs    = try c.decodeIfPresent(Double.self, forKey: .carbs)   ?? 0
        fat      = try c.decodeIfPresent(Double.self, forKey: .fat)     ?? 0
    }

    public static let zero = Macros(calories: 0, protein: 0, carbs: 0, fat: 0)

    // Use stored calories when present; fall back to 4/4/9 formula so that a meal
    // saved without an explicit calorie value doesn't silently drop from the total.
    private var effectiveCalories: Int {
        calories > 0 ? calories : Int((proteinCalories + carbCalories + fatCalories).rounded())
    }

    public func adding(_ other: Macros) -> Macros {
        Macros(
            calories: effectiveCalories + other.effectiveCalories,
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
