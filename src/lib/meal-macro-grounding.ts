import { dbGetMeals, dbGetNutritionCache, dbSaveMeal, dbSaveNutritionCache } from "@/lib/db";
import { COMMON_FOODS, parseQuantityAndFood } from "@/lib/food-quantity-parser";
import { invokeNovaWithWebGroundingOrFallback } from "@/lib/nova";
import { mealIdentityKey } from "@/lib/meals-dedupe";

export type GroundedMacros = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: string;
};

const WEB_SYSTEM = `You look up nutrition the way a Google nutrition result does.
Prefer USDA FoodData Central, or the brand or restaurant's published nutrition facts, for the serving the user named.
Do not invent a coach's rough estimate. Do not scale to a whole day.
Return ONLY a JSON object with numeric keys calories, protein, carbs, and fat. Protein, carbs, and fat are grams.`;

function roundMacros(n: { calories?: number; protein?: number; carbs?: number; fat?: number }, quantity = 1): GroundedMacros {
  return {
    calories: Math.round((n.calories ?? 0) * quantity),
    protein: Math.round((n.protein ?? 0) * quantity * 10) / 10,
    carbs: Math.round((n.carbs ?? 0) * quantity * 10) / 10,
    fat: Math.round((n.fat ?? 0) * quantity * 10) / 10,
    source: "lookup",
  };
}

function parseJson(text: string): { calories?: number; protein?: number; carbs?: number; fat?: number } {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return {};
  try {
    const obj = JSON.parse(match[0]) as Record<string, unknown>;
    const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" ? Number(v) : undefined);
    return { calories: num(obj.calories), protein: num(obj.protein), carbs: num(obj.carbs), fat: num(obj.fat) };
  } catch {
    return {};
  }
}

function usable(n: { calories?: number; protein?: number; carbs?: number; fat?: number }): boolean {
  return [n.calories, n.protein, n.carbs, n.fat].some((v) => typeof v === "number" && Number.isFinite(v) && v >= 0);
}

/** USDA-style common foods only on an exact name, so "chicken salad" is not logged as plain greens. */
export function exactCommonFood(name: string): GroundedMacros | null {
  const { quantity, food } = parseQuantityAndFood(name);
  const known = COMMON_FOODS[food.toLowerCase()];
  if (!known) return null;
  return { ...roundMacros(known, quantity), source: "common-foods" };
}

/** Instant path: exact staples + Dynamo nutrition cache. Never hits the web. */
export async function groundMealMacrosFast(name: string): Promise<GroundedMacros | null> {
  const query = name.trim();
  if (!query) return null;

  const exact = exactCommonFood(query);
  if (exact && exact.calories > 0) return exact;

  try {
    const cached = await dbGetNutritionCache(query);
    if (cached && cached.source !== "openfoodfacts" && cached.calories > 0) {
      return {
        calories: cached.calories,
        protein: cached.protein,
        carbs: cached.carbs,
        fat: cached.fat,
        source: `cache(${cached.source})`,
      };
    }
  } catch {
    /* cache is optional */
  }
  return null;
}

/**
 * Full lookup including web grounding. Prefer `groundMealMacrosFast` on the chat
 * critical path and call this after the meal is already saved.
 */
export async function groundMealMacros(name: string): Promise<GroundedMacros | null> {
  const query = name.trim();
  if (!query) return null;

  const fast = await groundMealMacrosFast(query);
  if (fast) return fast;

  try {
    const { text, source } = await invokeNovaWithWebGroundingOrFallback(
      WEB_SYSTEM,
      `Search the web for the nutrition facts of this food or meal, as stated: "${query}". Use one typical serving of that exact item. Return calories, protein (g), carbs (g), and fat (g) as JSON only.`,
      { temperature: 0.1, maxTokens: 300 },
    );
    const parsed = parseJson(text);
    if (!usable(parsed)) return null;
    const macros = { ...roundMacros(parsed), source: source ?? "web-grounding" };
    dbSaveNutritionCache(query, {
      calories: macros.calories,
      protein: macros.protein,
      carbs: macros.carbs,
      fat: macros.fat,
      source: macros.source,
      cachedAt: new Date().toISOString(),
    }).catch(() => {});
    return macros;
  } catch {
    return null;
  }
}

type LogAction = { type: string; payload: Record<string, unknown> };

function mealNeedsWebGrounding(action: LogAction): boolean {
  if (action.type !== "log_meal") return false;
  const source = typeof action.payload.macroSource === "string" ? action.payload.macroSource : "";
  return !source.startsWith("common-foods") && !source.startsWith("cache(");
}

/**
 * Apply only fast lookups so The Ref can reply without waiting on web search.
 * Sets `macroSource` on the payload when a fast hit lands.
 */
export async function groundLogMealActionsFast(
  actions: LogAction[],
  lookup: (name: string) => Promise<GroundedMacros | null> = groundMealMacrosFast,
): Promise<string[]> {
  const notes: string[] = [];
  await Promise.all(
    actions.map(async (action) => {
      if (action.type !== "log_meal") return;
      const name = typeof action.payload.name === "string" ? action.payload.name.trim() : "";
      if (!name) return;
      const grounded = await lookup(name);
      if (!grounded || grounded.calories <= 0) return;
      action.payload.calories = grounded.calories;
      action.payload.protein = grounded.protein;
      action.payload.carbs = grounded.carbs;
      action.payload.fat = grounded.fat;
      action.payload.macroSource = grounded.source;
      notes.push(
        `${name}: ${grounded.calories} cal, ${grounded.protein}g protein, ${grounded.carbs}g carbs, ${grounded.fat}g fat`,
      );
    }),
  );
  return notes;
}

/** @deprecated Prefer groundLogMealActionsFast on the chat path. */
export async function groundLogMealActions(
  actions: LogAction[],
  lookup: (name: string) => Promise<GroundedMacros | null> = groundMealMacros,
): Promise<string[]> {
  return groundLogMealActionsFast(actions, lookup);
}

/**
 * After a meal is persisted, refine macros with web grounding and rewrite the row.
 * Fire-and-forget from API routes — never block the chat reply on this.
 */
export async function enrichPersistedLogMeals(
  userId: string,
  actions: LogAction[],
): Promise<void> {
  const pending = actions.filter(mealNeedsWebGrounding);
  if (pending.length === 0) return;

  const existing = await dbGetMeals(userId);
  await Promise.all(
    pending.map(async (action) => {
      const name = typeof action.payload.name === "string" ? action.payload.name.trim() : "";
      const id = typeof action.payload.id === "string" ? action.payload.id : "";
      const date = typeof action.payload.date === "string" ? action.payload.date : "";
      if (!name || !id || !date) return;

      const grounded = await groundMealMacros(name);
      if (!grounded || grounded.calories <= 0) return;
      if (grounded.source.startsWith("common-foods") || grounded.source.startsWith("cache(")) return;

      const key = mealIdentityKey({ id, date });
      const meal = existing.find((m) => mealIdentityKey(m) === key);
      if (!meal) return;

      await dbSaveMeal(userId, {
        ...meal,
        macros: {
          calories: grounded.calories,
          protein: grounded.protein,
          carbs: grounded.carbs,
          fat: grounded.fat,
        },
      });
    }),
  );
}
