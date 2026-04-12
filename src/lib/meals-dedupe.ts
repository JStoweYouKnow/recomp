import type { MealEntry } from "./types";

/**
 * One meal row per (calendar date, id). Drops accidental duplicates in the
 * in-memory array (e.g. bad merges, double sync) while preserving first-seen order.
 */
export function dedupeMealsByDateAndId(meals: MealEntry[]): MealEntry[] {
  const seen = new Set<string>();
  const out: MealEntry[] = [];
  for (const m of meals) {
    if (!m?.id || typeof m.date !== "string") continue;
    const k = `${m.date}\t${m.id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(m);
  }
  return out;
}
