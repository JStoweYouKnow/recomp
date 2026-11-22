import type { MealEntry } from "./types";

/**
 * One meal row per (calendar date, id). Drops accidental duplicates in the
 * in-memory array (e.g. bad merges, double sync) while preserving first-seen order.
 */
/** `yyyy-MM-dd` plus id, so a timestamped date still matches a calendar-day date. */
export function mealIdentityKey(meal: { id?: string; date?: string }): string | null {
  if (!meal?.id || typeof meal.date !== "string") return null;
  const day = /^\d{4}-\d{2}-\d{2}/.test(meal.date) ? meal.date.slice(0, 10) : meal.date;
  return `${day}\t${meal.id}`;
}

/**
 * Meals stored on the server that a full client snapshot no longer contains.
 * A payload that drops at least 3 meals and more than half the log is treated as a
 * partial read, not a delete — that path was erasing several days of entries.
 */
export function mealsOmittedBySnapshot<T extends { id?: string; date?: string }>(
  existing: T[],
  incoming: T[]
): T[] {
  const incomingKeys = new Set(
    incoming.map(mealIdentityKey).filter((key): key is string => key != null)
  );
  const missing = existing.filter((meal) => {
    const key = mealIdentityKey(meal);
    return key != null && !incomingKeys.has(key);
  });
  const partialRead = missing.length >= 3 && incoming.length * 2 < existing.length;
  return partialRead ? [] : missing;
}

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
