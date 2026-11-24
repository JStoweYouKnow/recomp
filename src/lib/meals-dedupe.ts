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

export type MealDeletionRef = { id: string; date: string };

/**
 * Snapshot sync used to delete every server meal missing from the client list.
 * That wiped days of logs whenever a client sent a partial read. Deletes are now
 * explicit via `deletedMeals` only — this helper always returns an empty list so
 * callers that still invoke it stay upsert-only.
 */
export function mealsOmittedBySnapshot<T extends { id?: string; date?: string }>(
  _existing: T[],
  _incoming: T[]
): T[] {
  return [];
}

/** Server meals that match an explicit client delete list (calendar-day identity). */
export function mealsMatchingDeletions<T extends { id?: string; date?: string }>(
  existing: T[],
  deletions: MealDeletionRef[]
): T[] {
  const keys = new Set(
    deletions.map((d) => mealIdentityKey(d)).filter((key): key is string => key != null)
  );
  if (keys.size === 0) return [];
  return existing.filter((meal) => {
    const key = mealIdentityKey(meal);
    return key != null && keys.has(key);
  });
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

export function dedupeMealDeletions(deletions: MealDeletionRef[]): MealDeletionRef[] {
  const seen = new Set<string>();
  const out: MealDeletionRef[] = [];
  for (const d of deletions) {
    const key = mealIdentityKey(d);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ id: d.id, date: /^\d{4}-\d{2}-\d{2}/.test(d.date) ? d.date.slice(0, 10) : d.date });
  }
  return out;
}
