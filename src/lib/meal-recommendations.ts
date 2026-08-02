import type { CookingAppRecipe, MealEntry, Macros } from "@/lib/types";
import type { RecentMealTemplate } from "@/lib/storage";
import {
  aggregateHistory,
  dominantMealType,
  isSnackLike,
  macroFitScore,
  normKey,
  type MealTypeValue,
  type RemainingMacros,
} from "@/lib/meal-quick-picks";
import { remainingMacros, scoreRecipeFit } from "@/lib/recipe-fit";

/** Where a recommendation came from — extensible for recipes & sponsored products. */
export type RecommendationSource =
  | "history"
  | "template"
  | "saved_recipe"
  | "discovered"
  | "sponsored";

export type RecommendationCategory = "meal" | "snack";

export interface MealRecommendation {
  id: string;
  name: string;
  macros: Macros;
  source: RecommendationSource;
  category: RecommendationCategory;
  fitScore: number;
  fitReason: string;
  mealType: MealTypeValue;
  logCount?: number;
  recipeUrl?: string;
  imageUrl?: string;
}

export interface MemoryRecommendationsResult {
  meals: MealRecommendation[];
  snacks: MealRecommendation[];
  budget: RemainingMacros;
}

export interface RecommendFromMemoryInput {
  meals: MealEntry[];
  templates?: RecentMealTemplate[];
  savedRecipes?: CookingAppRecipe[];
  targets: Macros;
  consumed: Macros;
  /** User fitness goal — improves saved-recipe scoring */
  goal?: string;
  mealLimit?: number;
  snackLimit?: number;
  /** Include saved recipes in results (recipe expansion path) */
  includeRecipes?: boolean;
}

const SNACK_CAL_MAX = 280;
const MEAL_CAL_MIN = 200;

function fitReasonFromScore(
  fit: number,
  remaining: RemainingMacros,
  macros: Macros,
  logCount?: number,
): string {
  const parts: string[] = [];
  if (logCount && logCount >= 3) parts.push(`Logged ${logCount}×`);
  else if (logCount && logCount >= 2) parts.push("Logged before");

  if (fit >= 0.85) {
    parts.push(`Fits your remaining ${Math.round(remaining.calories)} cal`);
  } else if (macros.calories <= remaining.calories) {
    parts.push(`${macros.calories} cal · ${Math.round(macros.protein)}g protein`);
  } else {
    parts.push(`Slightly over remaining budget`);
  }
  return parts.join(" · ") || "From your history";
}

function toFitScore(raw: number): number {
  return Math.round(Math.min(100, Math.max(0, raw * 100)));
}

type InternalRow = MealRecommendation & { _rawScore: number };

function buildHistoryRows(
  meals: MealEntry[],
  templates: RecentMealTemplate[],
  targets: Macros,
  remaining: RemainingMacros,
): InternalRow[] {
  const history = aggregateHistory(meals, 120);
  const byKey = new Map<string, InternalRow>();

  for (const t of templates) {
    const key = normKey(t.name);
    if (!key) continue;
    const h = history.get(key);
    const count = h?.count ?? 1;
    const macros = t.macros;
    const typeCounts = h?.typeCounts;
    const snack = isSnackLike(macros, typeCounts);
    const fit = macroFitScore(macros, remaining, targets);
    const freq = 1 + Math.log1p(count);
    const score = freq * fit;
    byKey.set(key, {
      id: `template-${key}`,
      name: t.name.trim(),
      macros,
      source: "template",
      category: snack ? "snack" : "meal",
      fitScore: toFitScore(fit),
      fitReason: fitReasonFromScore(fit, remaining, macros, count),
      mealType: h ? dominantMealType(typeCounts, h.lastMealType) : snack ? "snack" : "lunch",
      logCount: count,
      _rawScore: score,
    });
  }

  for (const [key, h] of history) {
    if (byKey.has(key)) continue;
    if (h.count < 2) continue;
    const avg: Macros = {
      calories: Math.round(h.sum.calories / h.count),
      protein: Math.round((h.sum.protein / h.count) * 10) / 10,
      carbs: Math.round((h.sum.carbs / h.count) * 10) / 10,
      fat: Math.round((h.sum.fat / h.count) * 10) / 10,
    };
    const snack = isSnackLike(avg, h.typeCounts);
    const fit = macroFitScore(avg, remaining, targets);
    const freq = 1 + Math.log1p(h.count);
    const score = freq * fit;
    byKey.set(key, {
      id: `history-${key}`,
      name: h.displayName,
      macros: avg,
      source: "history",
      category: snack ? "snack" : "meal",
      fitScore: toFitScore(fit),
      fitReason: fitReasonFromScore(fit, remaining, avg, h.count),
      mealType: dominantMealType(h.typeCounts, h.lastMealType),
      logCount: h.count,
      _rawScore: score,
    });
  }

  return [...byKey.values()];
}

function buildRecipeRows(
  recipes: CookingAppRecipe[],
  budget: RemainingMacros,
  goal?: string,
): InternalRow[] {
  return recipes
    .map((r) => {
      const macros: Macros = {
        calories: r.calories,
        protein: r.protein,
        carbs: r.carbs,
        fat: r.fat,
      };
      const snack = isSnackLike(macros) || (r.mealTypes?.includes("snack") ?? false);
      const { fitScore, fitReason } = scoreRecipeFit(r, budget, { goal });
      return {
        id: `recipe-${r.id}`,
        name: r.name,
        macros,
        source: "saved_recipe" as const,
        category: (snack ? "snack" : "meal") as RecommendationCategory,
        fitScore,
        fitReason: fitReason || "Saved recipe",
        mealType: (r.mealTypes?.[0] as MealTypeValue | undefined) ?? (snack ? "snack" : "dinner"),
        recipeUrl: r.recipeUrl,
        _rawScore: fitScore / 100,
      };
    })
    .filter((r) => r.fitScore >= 35);
}

function splitAndRank(
  rows: InternalRow[],
  mealLimit: number,
  snackLimit: number,
): { meals: MealRecommendation[]; snacks: MealRecommendation[] } {
  const seen = new Set<string>();
  const deduped = rows
    .sort((a, b) => b._rawScore - a._rawScore)
    .filter((r) => {
      const k = normKey(r.name);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

  const meals = deduped
    .filter((r) => r.category === "meal" && r.macros.calories >= MEAL_CAL_MIN * 0.5)
    .slice(0, mealLimit)
    .map(({ _rawScore: _, ...rest }) => rest);

  const snacks = deduped
    .filter(
      (r) =>
        r.category === "snack" ||
        (r.macros.calories > 0 && r.macros.calories <= SNACK_CAL_MAX),
    )
    .slice(0, snackLimit)
    .map(({ _rawScore: _, ...rest }) => ({ ...rest, category: "snack" as const }));

  return { meals, snacks };
}

/**
 * Recommend macro-friendly meals and snacks from the user's logged history,
 * recent templates, and (optionally) saved recipes.
 *
 * Designed to extend toward curated recipes and sponsored products via `source`.
 */
export function recommendFromMemory(input: RecommendFromMemoryInput): MemoryRecommendationsResult {
  const {
    meals,
    templates = [],
    savedRecipes = [],
    targets,
    consumed,
    goal,
    mealLimit = 6,
    snackLimit = 4,
    includeRecipes = true,
  } = input;

  const budget = remainingMacros(targets, consumed);

  const historyRows = buildHistoryRows(meals, templates, targets, budget);
  const recipeRows =
    includeRecipes && savedRecipes.length > 0
      ? buildRecipeRows(savedRecipes, budget, goal)
      : [];

  const allRows = [...historyRows, ...recipeRows];
  const { meals: mealRecs, snacks: snackRecs } = splitAndRank(allRows, mealLimit, snackLimit);

  return {
    meals: mealRecs,
    snacks: snackRecs,
    budget,
  };
}

export type { MealTypeValue } from "@/lib/meal-quick-picks";
export { inferMealTypeForNow } from "@/lib/user-recipe-context";
