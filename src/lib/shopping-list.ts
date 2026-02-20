import type { FitnessPlan } from "./types";

/**
 * Extract a deduplicated list of ingredients from the diet plan's weekly meals.
 * Splits meal descriptions by comma/semicolon and normalizes for search.
 */
export function buildShoppingListFromPlan(plan: FitnessPlan | null): string[] {
  if (!plan?.dietPlan?.weeklyPlan) return [];
  const seen = new Set<string>();
  const items: string[] = [];
  for (const day of plan.dietPlan.weeklyPlan) {
    for (const meal of day.meals ?? []) {
      const desc = (meal.description ?? "").trim();
      if (!desc) continue;
      const parts = desc.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
      for (const part of parts) {
        const key = part.toLowerCase();
        if (key && !seen.has(key)) {
          seen.add(key);
          items.push(part);
        }
      }
    }
  }
  return items.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}
