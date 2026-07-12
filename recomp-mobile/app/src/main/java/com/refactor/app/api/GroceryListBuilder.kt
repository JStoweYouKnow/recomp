package com.refactor.app.api

import com.refactor.app.api.dto.GroceryItemDto
import com.refactor.app.api.dto.MealPrepRecipeDto

/**
 * Consolidates meal-prep recipe ingredients into a checkable grocery list,
 * skipping items already in the pantry. Mirrors the web
 * POST /api/meal-prep/grocery-list consolidation so all platforms agree.
 */
fun buildGroceryList(
    recipes: List<MealPrepRecipeDto>,
    pantryNames: List<String>,
): List<GroceryItemDto> {
    val consolidated = LinkedHashMap<String, GroceryItemDto>()
    for (recipe in recipes) {
        for (ing in recipe.ingredients) {
            val key = ing.name.trim().lowercase()
            if (key.isEmpty()) continue
            val existing = consolidated[key]
            consolidated[key] = if (existing != null) {
                existing.copy(amount = "${existing.amount} + ${ing.amount}")
            } else {
                GroceryItemDto(
                    item = key,
                    amount = ing.amount,
                    category = ing.category.trim().lowercase().ifBlank { "other" },
                )
            }
        }
    }
    val pantry = pantryNames.map { it.trim().lowercase() }.toSet()
    return consolidated.values
        .filter { it.item !in pantry }
        .sortedBy { it.category }
}
