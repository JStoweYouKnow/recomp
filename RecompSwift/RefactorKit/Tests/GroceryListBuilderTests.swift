import Foundation
import Testing
import RefactorKit

private func recipe(name: String, ingredients: [(String, String, String)]) -> MealPrepRecipe {
    MealPrepRecipe(
        name: name,
        servings: 4,
        macrosPerServing: Macros(calories: 500, protein: 40, carbs: 45, fat: 15),
        ingredients: ingredients.map { MealPrepRecipe.Ingredient(name: $0.0, amount: $0.1, category: $0.2) },
        instructions: [],
        prepTime: 10,
        cookTime: 20
    )
}

@Test func groceryList_consolidatesDuplicateIngredients() {
    let list = GroceryListBuilder.build(
        from: [
            recipe(name: "Chicken bowl", ingredients: [("Chicken breast", "500g", "protein"), ("Rice", "200g", "grains")]),
            recipe(name: "Chicken salad", ingredients: [("chicken breast ", "300g", "protein"), ("Lettuce", "1 head", "produce")]),
        ],
        pantryNames: []
    )
    #expect(list.count == 3)
    let chicken = list.first { $0.item == "chicken breast" }
    #expect(chicken?.amount == "500g + 300g")
}

@Test func groceryList_skipsPantryItems() {
    let list = GroceryListBuilder.build(
        from: [recipe(name: "Bowl", ingredients: [("Rice", "200g", "grains"), ("Olive oil", "2 tbsp", "oils")])],
        pantryNames: ["Olive Oil"]
    )
    #expect(list.count == 1)
    #expect(list.first?.item == "rice")
}

@Test func groceryList_sortsByCategoryAndDefaultsEmptyToOther() {
    let list = GroceryListBuilder.build(
        from: [recipe(name: "Mix", ingredients: [("Mystery", "1", ""), ("Apple", "2", "produce"), ("Rice", "1 cup", "grains")])],
        pantryNames: []
    )
    #expect(list.map(\.category) == ["grains", "other", "produce"])
    #expect(list.allSatisfy { !$0.checked })
}
