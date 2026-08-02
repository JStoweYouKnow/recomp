import type { ScoredRecipe } from "@/lib/recipe-fit";
import type { MealRecommendation } from "@/lib/meal-recommendations";
import type { MealTypeValue } from "@/lib/meal-quick-picks";

/** Map ranked external/saved recipe suggestions into MealRecommendation chips. */
export function scoredRecipesToRecommendations(
  recipes: ScoredRecipe[],
  mealType: MealTypeValue = "dinner",
): MealRecommendation[] {
  return recipes.map((r) => ({
    id: r.id,
    name: r.name,
    macros: {
      calories: r.calories,
      protein: r.protein,
      carbs: r.carbs,
      fat: r.fat,
    },
    source: r.source === "edamam" || r.source === "curated" ? "discovered" : "saved_recipe",
    category: r.calories <= 280 ? "snack" : "meal",
    fitScore: r.fitScore,
    fitReason: r.fitReason,
    mealType,
    recipeUrl: r.recipeUrl,
    imageUrl: undefined,
  }));
}
