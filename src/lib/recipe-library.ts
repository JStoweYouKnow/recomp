import type { CookingAppRecipe } from "./types";
import { rankRecipes, scoreRecipeFit, type MacroBudget, type ScoredRecipe } from "./recipe-fit";
import { CURATED_RECIPES, getRecipesForBudget } from "./recipe-suggestions";
import { discoverRecipes, type DiscoveredRecipe } from "./services/edamam";

function curatedToSaved(curated: (typeof CURATED_RECIPES)[number]): CookingAppRecipe {
  return {
    id: `curated_${curated.name.toLowerCase().replace(/\s+/g, "_").slice(0, 40)}`,
    name: curated.name,
    calories: curated.calories,
    protein: curated.protein,
    carbs: curated.carbs,
    fat: curated.fat,
    recipeUrl: curated.url,
    source: "curated",
    mealTypes: curated.mealTypes,
    addedAt: new Date().toISOString(),
  };
}

export function rankSavedAndCuratedRecipes(
  saved: CookingAppRecipe[],
  budget: MacroBudget,
  opts?: { goal?: string; mealType?: string; limit?: number; includeCurated?: boolean }
): ScoredRecipe[] {
  const limit = opts?.limit ?? 8;
  const pool = [...saved];

  if (opts?.includeCurated !== false) {
    const curated = getRecipesForBudget(
      budget.calories,
      opts?.goal ?? "maintain",
      opts?.mealType,
      12
    );
    const savedNames = new Set(saved.map((r) => r.name.toLowerCase()));
    for (const c of curated) {
      if (!savedNames.has(c.name.toLowerCase())) {
        pool.push(curatedToSaved(c));
      }
    }
  }

  return rankRecipes(pool, budget, { goal: opts?.goal, mealType: opts?.mealType, limit });
}

export async function rankWithDiscovery(
  saved: CookingAppRecipe[],
  budget: MacroBudget,
  opts?: {
    goal?: string;
    mealType?: string;
    limit?: number;
    query?: string;
    includeDiscover?: boolean;
  }
): Promise<ScoredRecipe[]> {
  const base = rankSavedAndCuratedRecipes(saved, budget, {
    goal: opts?.goal,
    mealType: opts?.mealType,
    limit: opts?.limit ?? 8,
  });

  if (!opts?.includeDiscover) return base;

  let external: DiscoveredRecipe[] = [];
  try {
    external = await discoverRecipes({
      query: opts.query,
      maxCalories: budget.calories * 1.1,
      minProtein: opts.goal === "build_muscle" ? 20 : undefined,
      mealType: opts?.mealType,
      limit: 5,
    });
  } catch {
    external = [];
  }

  const existingUrls = new Set(
    [...saved, ...base].map((r) => (r.recipeUrl ?? r.name).toLowerCase())
  );

  const discoveredScored: ScoredRecipe[] = external
    .filter((r) => !existingUrls.has((r.recipeUrl ?? r.name).toLowerCase()))
    .map((r) => {
      const { fitScore, fitReason } = scoreRecipeFit(r, budget, {
        goal: opts?.goal,
        mealType: opts?.mealType,
      });
      return {
        id: r.id,
        name: r.name,
        calories: r.calories,
        protein: r.protein,
        carbs: r.carbs,
        fat: r.fat,
        recipeUrl: r.recipeUrl,
        source: r.source,
        fitScore,
        fitReason: `${fitReason} · from Edamam`,
      };
    })
    .filter((r) => r.fitScore > 0);

  return [...base, ...discoveredScored]
    .sort((a, b) => b.fitScore - a.fitScore)
    .slice(0, opts?.limit ?? 8);
}
