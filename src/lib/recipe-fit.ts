import type { CookingAppRecipe } from "./types";

export interface MacroBudget {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface ScoredRecipe {
  id: string;
  name: string;
  description?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  recipeUrl?: string;
  source?: string;
  fitScore: number;
  fitReason: string;
}

export function remainingMacros(
  targets: MacroBudget,
  consumed: Partial<MacroBudget>
): MacroBudget {
  return {
    calories: Math.max(0, targets.calories - (consumed.calories ?? 0)),
    protein: Math.max(0, targets.protein - (consumed.protein ?? 0)),
    carbs: Math.max(0, targets.carbs - (consumed.carbs ?? 0)),
    fat: Math.max(0, targets.fat - (consumed.fat ?? 0)),
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Score 0–100: how well a recipe fits today's remaining macro budget and goal. */
export function scoreRecipeFit(
  recipe: Pick<CookingAppRecipe, "calories" | "protein" | "carbs" | "fat" | "name">,
  budget: MacroBudget,
  opts?: { goal?: string; mealType?: string }
): { fitScore: number; fitReason: string } {
  const calBudget = Math.max(budget.calories, 150);
  const proBudget = Math.max(budget.protein, 10);
  const goal = opts?.goal ?? "maintain";

  if (recipe.calories <= 0) {
    return { fitScore: 0, fitReason: "Missing nutrition data" };
  }

  const calRatio = recipe.calories / calBudget;
  let calScore = 0;
  let calReason = "";

  if (calRatio > 1.2) {
    calScore = clamp(30 - (calRatio - 1.2) * 80, 0, 30);
    calReason = `${recipe.calories} cal is over your remaining ${Math.round(calBudget)} cal`;
  } else if (calRatio >= 0.45 && calRatio <= 1.05) {
    calScore = 40 - Math.abs(calRatio - 0.85) * 25;
    calReason = `Fits your remaining ${Math.round(calBudget)} cal budget`;
  } else if (calRatio < 0.45) {
    calScore = 25;
    calReason = `Light option — room for sides or snacks`;
  } else {
    calScore = 30;
    calReason = `Slightly over budget but workable`;
  }

  const proRatio = recipe.protein / proBudget;
  let proScore = 0;
  let proReason = "";
  if (goal === "build_muscle" || goal === "lose_weight") {
    if (recipe.protein >= 25 && proRatio >= 0.5) {
      proScore = goal === "build_muscle" ? 30 : 22;
      proReason = `${recipe.protein}g protein supports your goal`;
    } else if (recipe.protein >= 15) {
      proScore = 15;
      proReason = `Moderate protein (${recipe.protein}g)`;
    } else {
      proScore = 5;
      proReason = `Lower protein (${recipe.protein}g)`;
    }
  } else {
    proScore = recipe.protein >= 12 ? 18 : 10;
    proReason = `${recipe.protein}g protein`;
  }

  let goalBonus = 10;
  if (goal === "lose_weight" && recipe.calories <= calBudget * 0.85) goalBonus = 18;
  if (goal === "build_muscle" && recipe.protein >= 30) goalBonus = 18;
  if (goal === "improve_endurance" && recipe.carbs >= 35) goalBonus = 16;

  const fitScore = Math.round(clamp(calScore + proScore + goalBonus, 0, 100));
  const fitReason = [calReason, proReason].filter(Boolean).join(" · ");

  return { fitScore, fitReason };
}

export function rankRecipes(
  recipes: CookingAppRecipe[],
  budget: MacroBudget,
  opts?: { goal?: string; mealType?: string; limit?: number }
): ScoredRecipe[] {
  const limit = opts?.limit ?? 8;
  const mealType = opts?.mealType;

  const filtered = recipes.filter((r) => {
    if (!mealType || !r.mealTypes?.length) return true;
    return (r.mealTypes as string[]).includes(mealType);
  });

  return filtered
    .map((r) => {
      const { fitScore, fitReason } = scoreRecipeFit(r, budget, opts);
      return {
        id: r.id,
        name: r.name,
        description: r.description,
        calories: r.calories,
        protein: r.protein,
        carbs: r.carbs,
        fat: r.fat,
        recipeUrl: r.recipeUrl,
        source: r.source,
        fitScore,
        fitReason,
      };
    })
    .filter((r) => r.fitScore > 0)
    .sort((a, b) => b.fitScore - a.fitScore)
    .slice(0, limit);
}
