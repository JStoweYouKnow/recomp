/**
 * Meals domain service.
 * Business logic for meal suggestions and analysis. No HTTP concerns.
 */

import { invokeNova } from "@/lib/nova";
import { getRecipesForBudget } from "@/lib/recipe-suggestions";

const MEAL_SUGGEST_SYSTEM = `You are a nutrition coach. Suggest 3-5 meal options for a given meal type and constraints, TAILORED to the user's goal.

Goals:
- lose_weight: Prefer high-volume, filling, lower-calorie options (salads, grilled chicken, eggs, veggies, lean protein). Avoid calorie-dense foods.
- maintain: Balanced, varied options the user can enjoy sustainably.
- build_muscle: Protein-dense options (chicken, beef, eggs, Greek yogurt, protein shakes). Include carbs for recovery.
- improve_endurance: Carb-focused options for fuel (oatmeal, rice, pasta, bananas, energy bars).

When the user provides recipes from their cooking app, prefer those or similar options that fit the budget. If no recipes, suggest varied options that fit the budget AND suit their goal.
Respond with valid JSON only.`;

export interface MealSuggestionInput {
  mealType?: string;
  remainingCalories?: number;
  remainingProtein?: number;
  restrictions?: string[];
  preferences?: string[];
  recipes?: Array<{ name?: string; description?: string; calories?: number; url?: string }>;
  goal?: string;
}

export interface MealSuggestion {
  name: string;
  description: string;
  calories: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  url?: string;
}

export interface SuggestMealsResult {
  suggestions: MealSuggestion[];
}

export function getCuratedSuggestions(
  remainingCalories: number,
  goal: string,
  mealType?: string,
  limit = 5
): MealSuggestion[] {
  const curated = getRecipesForBudget(remainingCalories, goal, mealType, limit);
  return curated.map((r) => ({
    name: r.name,
    description: `Per serving · ${r.calories} cal`,
    calories: r.calories,
    protein: r.protein,
    carbs: r.carbs,
    fat: r.fat,
    url: r.url,
  }));
}

export async function suggestMealsFromNova(input: MealSuggestionInput): Promise<SuggestMealsResult> {
  const cal = typeof input.remainingCalories === "number" ? input.remainingCalories : 500;
  const goalStr = (input.goal as string) || "maintain";
  const goalBlock = input.goal ? `\nUser's fitness goal: ${input.goal}. Tailor suggestions to this goal.\n` : "";
  const recipeBlock =
    input.recipes && input.recipes.length > 0
      ? `\nThe user has these recipes from their cooking app. Prefer suggesting these or similar options that fit the budget:\n${input.recipes
          .slice(0, 30)
          .map(
            (r) =>
              `- ${r.name ?? "Recipe"}${r.description ? `: ${r.description}` : ""}${r.calories != null ? ` (~${r.calories} kcal)` : ""}${r.url ? ` [${r.url}]` : ""}`
          )
          .join("\n")}\n`
      : "";

  const userMessage = `Suggest ATYPICAL, interesting meal options for ${input.mealType || "lunch"}.
- Remaining calories to use: ~${cal} kcal (all suggestions must fit within this).
- Remaining protein needed: ~${input.remainingProtein ?? "flexible"} g
- Restrictions: ${input.restrictions?.join(", ") || "None"}
- Preferences: ${input.preferences || "None"}
- IMPORTANT: Suggest unique, globally-inspired, or lesser-known dishes (e.g. shakshuka, bibimbap, mujadara, chana masala, okonomiyaki) that still achieve the caloric goal.
${goalBlock}${recipeBlock}
Respond with JSON only:
{"suggestions": [{"name": "Meal name", "description": "Brief description", "calories": n, "protein": n, "carbs": n, "fat": n, "url": "optional recipe URL if you know a real one"}, ...]}`;

  const raw = await invokeNova(MEAL_SUGGEST_SYSTEM, userMessage, {
    temperature: 0.8,
    maxTokens: 1024,
  });

  const match = raw.match(/\{[\s\S]*\}/);
  const parsed = match ? JSON.parse(match[0]) : { suggestions: [] };
  return parsed as SuggestMealsResult;
}
