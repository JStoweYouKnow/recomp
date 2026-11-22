import Foundation

/// Foods the user has logged, kept outside SwiftData.
///
/// The add-meal sheet uses this so a meal typed for the first time still shows up
/// in Recent even if a sync pull has not finished merging that row yet.
public struct RememberedMeal: Codable, Sendable, Identifiable, Equatable {
    public var id: String { name.lowercased() }
    public var name: String
    public var calories: Int
    public var protein: Double
    public var carbs: Double
    public var fat: Double
    public var mealType: String
    public var lastUsed: Date

    public init(
        name: String,
        calories: Int,
        protein: Double,
        carbs: Double,
        fat: Double,
        mealType: String,
        lastUsed: Date
    ) {
        self.name = name
        self.calories = calories
        self.protein = protein
        self.carbs = carbs
        self.fat = fat
        self.mealType = mealType
        self.lastUsed = lastUsed
    }
}

public enum RecentMealMemory {
    private static let key = "recomp_recent_meal_memory_v1"
    private static let limit = 40

    public static func record(name: String, macros: Macros, mealType: MealType, at date: Date = .now) {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        var items = load().filter { $0.name.lowercased() != trimmed.lowercased() }
        items.insert(
            RememberedMeal(
                name: trimmed,
                calories: macros.calories,
                protein: macros.protein,
                carbs: macros.carbs,
                fat: macros.fat,
                mealType: mealType.rawValue,
                lastUsed: date
            ),
            at: 0
        )
        save(Array(items.prefix(limit)))
    }

    public static func load() -> [RememberedMeal] {
        guard let data = RecompAppGroupDefaults.shared.data(forKey: key),
              let decoded = try? JSONDecoder().decode([RememberedMeal].self, from: data) else {
            return []
        }
        return decoded.sorted { $0.lastUsed > $1.lastUsed }
    }

    private static func save(_ items: [RememberedMeal]) {
        guard let data = try? JSONEncoder().encode(items) else { return }
        RecompAppGroupDefaults.shared.set(data, forKey: key)
    }
}
