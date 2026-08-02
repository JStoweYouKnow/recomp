import type { MealEntry, Macros } from "@/lib/types";
import type { RecentMealTemplate } from "@/lib/storage";

export interface RemainingMacros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

function normKey(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

/** How well a meal's macros fit what's left today vs daily targets (0–1). */
function macroFitScore(m: Macros, remaining: RemainingMacros, targets: Macros): number {
  const remC = Math.max(0, remaining.calories);
  const remP = Math.max(0, remaining.protein);
  const remCarb = Math.max(0, remaining.carbs);
  const remF = Math.max(0, remaining.fat);
  const c = Math.max(0, m.calories);
  const p = Math.max(0, m.protein);
  const carb = Math.max(0, m.carbs);
  const f = Math.max(0, m.fat);

  let score = 1;

  // Calories: prefer fitting in remaining; soft preference to use a sensible share when plenty is left
  if (remC < 1) {
    score *= c <= 120 ? 1 : Math.max(0.35, 1 - (c - 120) / 400);
  } else if (c > remC) {
    score *= Math.max(0.15, 1 - (c - remC) / Math.max(remC, 1));
  } else {
    const share = c / remC;
    if (remC > 200 && share < 0.12) score *= 0.65 + 0.35 * Math.min(1, share / 0.12);
    else if (remC > 200 && share > 0.98) score *= 0.92;
    else score *= 0.88 + 0.12 * share;
  }

  // Protein: when user still needs protein, prefer meals that contribute meaningfully
  if (remP > 5 && targets.protein > 0) {
    const idealP = Math.min(remP, Math.max(12, remP * 0.55));
    const err = Math.abs(p - idealP) / Math.max(idealP, 8);
    score *= Math.max(0.45, 1 - 0.45 * Math.min(err, 1.2));
  }

  // Carbs / fat: light alignment when there's meaningful room left
  if (remCarb > 15 && targets.carbs > 0) {
    const idealCarb = Math.min(remCarb, Math.max(8, remCarb * 0.5));
    const err = Math.abs(carb - idealCarb) / Math.max(idealCarb, 10);
    score *= Math.max(0.55, 1 - 0.25 * Math.min(err, 1));
  }
  if (remF > 8 && targets.fat > 0) {
    const idealF = Math.min(remF, Math.max(5, remF * 0.45));
    const err = Math.abs(f - idealF) / Math.max(idealF, 6);
    score *= Math.max(0.55, 1 - 0.25 * Math.min(err, 1));
  }

  return Math.min(1, Math.max(0.08, score));
}

export type MealTypeValue = MealEntry["mealType"];

type Agg = {
  displayName: string;
  count: number;
  sum: Macros;
  lastIso: string;
  /** How often this food was logged as each meal type */
  typeCounts: Partial<Record<MealTypeValue, number>>;
  lastMealType: MealTypeValue;
};

function aggregateHistory(meals: MealEntry[], maxAgeDays: number): Map<string, Agg> {
  const cutoff = Date.now() - maxAgeDays * 86400000;
  const map = new Map<string, Agg>();
  for (const meal of meals) {
    const t = new Date(meal.loggedAt || meal.date).getTime();
    if (t < cutoff) continue;
    const key = normKey(meal.name);
    if (!key) continue;
    const cur = map.get(key);
    const m = meal.macros;
    if (!cur) {
      map.set(key, {
        displayName: meal.name.trim(),
        count: 1,
        sum: { ...m },
        lastIso: meal.loggedAt || `${meal.date}T12:00:00.000Z`,
        typeCounts: { [meal.mealType]: 1 },
        lastMealType: meal.mealType,
      });
    } else {
      cur.count += 1;
      cur.sum.calories += m.calories;
      cur.sum.protein += m.protein;
      cur.sum.carbs += m.carbs;
      cur.sum.fat += m.fat;
      cur.typeCounts[meal.mealType] = (cur.typeCounts[meal.mealType] ?? 0) + 1;
      const last = meal.loggedAt || `${meal.date}T12:00:00.000Z`;
      if (last > cur.lastIso) {
        cur.lastIso = last;
        cur.displayName = meal.name.trim();
        cur.lastMealType = meal.mealType;
      }
    }
  }
  return map;
}

/** True when history or calories suggest this item works as a snack. */
export function isSnackLike(
  macros: Macros,
  typeCounts?: Partial<Record<MealTypeValue, number>>,
): boolean {
  if (macros.calories > 0 && macros.calories <= 280) return true;
  if (!typeCounts) return false;
  const snackCount = typeCounts.snack ?? 0;
  const mealCount = (typeCounts.breakfast ?? 0) + (typeCounts.lunch ?? 0) + (typeCounts.dinner ?? 0);
  return snackCount > 0 && snackCount >= mealCount;
}

export function dominantMealType(
  typeCounts?: Partial<Record<MealTypeValue, number>>,
  fallback: MealTypeValue = "lunch",
): MealTypeValue {
  if (!typeCounts) return fallback;
  let best: MealTypeValue = fallback;
  let bestCount = 0;
  for (const [type, count] of Object.entries(typeCounts) as [MealTypeValue, number][]) {
    if (count > bestCount) {
      bestCount = count;
      best = type;
    }
  }
  return best;
}

export { aggregateHistory, macroFitScore, normKey };

/**
 * Rank saved templates + frequently logged meals for the quick-pick row.
 * Prioritizes foods logged often and whose macros fit remaining daily budget.
 */
export function rankMealQuickPicks(
  meals: MealEntry[],
  templates: RecentMealTemplate[],
  targets: Macros,
  consumed: Macros,
  remaining: RemainingMacros,
  limit = 12,
): RecentMealTemplate[] {
  const history = aggregateHistory(meals, 120);

  type Row = RecentMealTemplate & { _score: number; _count: number };

  const byKey = new Map<string, Row>();

  for (const t of templates) {
    const key = normKey(t.name);
    if (!key) continue;
    const h = history.get(key);
    const count = h ? h.count : 1;
    const macros = t.macros;
    const freq = 1 + Math.log1p(count);
    const fit = macroFitScore(macros, remaining, targets);
    const score = freq * fit;
    byKey.set(key, {
      name: t.name.trim(),
      macros,
      lastUsed: t.lastUsed,
      _score: score,
      _count: count,
    });
  }

  for (const [key, h] of history) {
    if (byKey.has(key)) continue;
    const avg: Macros = {
      calories: Math.round(h.sum.calories / h.count),
      protein: Math.round((h.sum.protein / h.count) * 10) / 10,
      carbs: Math.round((h.sum.carbs / h.count) * 10) / 10,
      fat: Math.round((h.sum.fat / h.count) * 10) / 10,
    };
    if (h.count < 2) continue;
    const freq = 1 + Math.log1p(h.count);
    const fit = macroFitScore(avg, remaining, targets);
    const score = freq * fit;
    byKey.set(key, {
      name: h.displayName,
      macros: avg,
      lastUsed: h.lastIso,
      _score: score,
      _count: h.count,
    });
  }

  const rows = [...byKey.values()].sort((a, b) => b._score - a._score);

  return rows.slice(0, limit).map(({ _score: _s, _count: _c, ...rest }) => rest);
}
