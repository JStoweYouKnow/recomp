/**
 * Edamam Recipe Search API — optional third-party discovery (Phase 3).
 * Set EDAMAM_APP_ID and EDAMAM_APP_KEY in env to enable.
 */

export interface DiscoveredRecipe {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  recipeUrl: string;
  source: "edamam";
  imageUrl?: string;
}

export function isEdamamConfigured(): boolean {
  return Boolean(process.env.EDAMAM_APP_ID && process.env.EDAMAM_APP_KEY);
}

export async function discoverRecipes(params: {
  query?: string;
  maxCalories?: number;
  minProtein?: number;
  mealType?: string;
  limit?: number;
}): Promise<DiscoveredRecipe[]> {
  const appId = process.env.EDAMAM_APP_ID;
  const appKey = process.env.EDAMAM_APP_KEY;
  if (!appId || !appKey) return [];

  const limit = Math.min(params.limit ?? 5, 10);
  const q = [params.query, params.mealType].filter(Boolean).join(" ") || "healthy dinner";
  const url = new URL("https://api.edamam.com/api/recipes/v2");
  url.searchParams.set("type", "public");
  url.searchParams.set("q", q);
  url.searchParams.set("app_id", appId);
  url.searchParams.set("app_key", appKey);
  url.searchParams.set("to", String(limit));
  if (params.maxCalories && params.maxCalories > 0) {
    url.searchParams.set("calories", `0-${Math.round(params.maxCalories)}`);
  }
  if (params.minProtein && params.minProtein > 0) {
    url.searchParams.set("nutrients[PROCNT]", `${Math.round(params.minProtein)}+`);
  }

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(12_000) });
  if (!res.ok) return [];

  const data = (await res.json()) as {
    hits?: Array<{
      recipe?: {
        uri?: string;
        label?: string;
        url?: string;
        image?: string;
        calories?: number;
        totalNutrients?: Record<string, { quantity?: number }>;
      };
    }>;
  };

  return (data.hits ?? [])
    .map((hit, i) => {
      const r = hit.recipe;
      if (!r?.label || !r.url) return null;
      const nutrients = r.totalNutrients ?? {};
      const servings = 1;
      const calories = Math.round((r.calories ?? nutrients.ENERC_KCAL?.quantity ?? 0) / servings);
      const protein = Math.round((nutrients.PROCNT?.quantity ?? 0) / servings);
      const carbs = Math.round((nutrients.CHOCDF?.quantity ?? 0) / servings);
      const fat = Math.round((nutrients.FAT?.quantity ?? 0) / servings);
      const uri = r.uri ?? `edamam-${i}`;
      const id = uri.replace(/^recipe_/, "").slice(0, 80) || `edamam-${i}`;
      return {
        id: `edamam_${id}`,
        name: r.label,
        calories,
        protein,
        carbs,
        fat,
        recipeUrl: r.url,
        source: "edamam" as const,
        imageUrl: r.image,
      };
    })
    .filter((x): x is DiscoveredRecipe => x !== null && x.calories > 0);
}
