import Foundation

/// Consolidates meal-prep recipe ingredients into a checkable grocery list,
/// skipping items already in the pantry. Mirrors the web
/// POST /api/meal-prep/grocery-list consolidation so all platforms agree.
public enum GroceryListBuilder {
    public static func build(
        from recipes: [MealPrepRecipe],
        pantryNames: [String]
    ) -> [MealPrepPlan.GroceryItem] {
        var order: [String] = []
        var amounts: [String: String] = [:]
        var categories: [String: String] = [:]

        for recipe in recipes {
            for ingredient in recipe.ingredients {
                let key = ingredient.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                guard !key.isEmpty else { continue }
                if let existing = amounts[key] {
                    amounts[key] = "\(existing) + \(ingredient.amount)"
                } else {
                    order.append(key)
                    amounts[key] = ingredient.amount
                    let category = ingredient.category.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                    categories[key] = category.isEmpty ? "other" : category
                }
            }
        }

        let pantry = Set(pantryNames.map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() })
        return order
            .filter { !pantry.contains($0) }
            .map {
                MealPrepPlan.GroceryItem(
                    item: $0,
                    amount: amounts[$0] ?? "",
                    category: categories[$0] ?? "other",
                    checked: false
                )
            }
            .sorted { $0.category < $1.category }
    }
}
