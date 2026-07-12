import type { CookingAppRecipe } from "./types";

/** Recipe Keeper / Paprika-style JSON export (array or wrapped object). */
export function parseRecipeKeeperExport(raw: string): CookingAppRecipe[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const list: unknown[] | null = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { recipes?: unknown[] }).recipes)
      ? (parsed as { recipes: unknown[] }).recipes
      : null;

  if (!list?.length) return null;

  const now = new Date().toISOString();
  const recipes: CookingAppRecipe[] = [];

  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const name = String(r.name ?? r.title ?? "").trim();
    if (!name) continue;

    const calories = Math.round(Number(r.calories ?? r.calorie ?? 0) || 0);
    const protein = Math.round(Number(r.protein ?? r.protein_g ?? 0) || 0);
    const carbs = Math.round(Number(r.carbs ?? r.carbohydrates ?? 0) || 0);
    const fat = Math.round(Number(r.fat ?? r.fat_g ?? 0) || 0);

    const url = typeof r.source_url === "string"
      ? r.source_url
      : typeof r.url === "string"
        ? r.url
        : typeof r.link === "string"
          ? r.link
          : undefined;

    recipes.push({
      id: `rk_${Date.now()}_${i}`,
      name,
      description: typeof r.description === "string" ? r.description.slice(0, 500) : undefined,
      calories: calories || Math.max(200, protein * 4 + carbs * 4 + fat * 9),
      protein,
      carbs,
      fat,
      recipeUrl: url,
      source: "recipekeeper",
      servings: Number(r.servings ?? r.yield) > 0 ? Math.round(Number(r.servings ?? r.yield)) : undefined,
      addedAt: now,
    });
  }

  return recipes.length > 0 ? recipes : null;
}

export function detectRecipeKeeperFormat(raw: string, filename?: string): boolean {
  if (filename?.toLowerCase().includes("recipekeeper") || filename?.toLowerCase().includes("paprika")) {
    return true;
  }
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false;
  try {
    const p = JSON.parse(trimmed);
    if (Array.isArray(p) && p[0] && typeof p[0] === "object" && ("name" in p[0] || "title" in p[0])) {
      return true;
    }
    if (p && typeof p === "object" && Array.isArray((p as { recipes?: unknown[] }).recipes)) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}
