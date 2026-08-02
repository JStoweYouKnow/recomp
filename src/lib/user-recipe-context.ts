import type {
  ActivityLogEntry,
  CookingAppRecipe,
  MealEntry,
  PantryItem,
  UserProfile,
} from "@/lib/types";
/** Infer time-appropriate meal type for one-tap logging. */
export function inferMealTypeForNow(): MealTypeValue {
  const hour = new Date().getHours();
  if (hour < 11) return "breakfast";
  if (hour < 15) return "lunch";
  if (hour < 21) return "dinner";
  return "snack";
}
import { normKey, type MealTypeValue } from "@/lib/meal-quick-picks";

export interface UserRecipeContext {
  goal: string;
  dietaryRestrictions: string[];
  timeOfDay: MealTypeValue;
  /** Remaining macro budget at time of request */
  remainingCalories: number;
  remainingProtein: number;
  topProteins: string[];
  topIngredients: string[];
  pantryNames: string[];
  avoidRecent: string[];
  trainingDay: boolean;
  /** Human-readable reason for the generated search (shown in UI) */
  activitySummary: string;
}

export interface BuildUserRecipeContextInput {
  meals: MealEntry[];
  pantry?: PantryItem[];
  activityLog?: ActivityLogEntry[];
  savedRecipes?: CookingAppRecipe[];
  profile?: Pick<UserProfile, "goal" | "dietaryRestrictions"> | null;
  date: string;
  /** Override inferred meal type */
  mealType?: MealTypeValue;
  remainingCalories: number;
  remainingProtein: number;
  goal?: string;
}

const PROTEIN_KEYWORDS = [
  "chicken",
  "salmon",
  "beef",
  "turkey",
  "egg",
  "tofu",
  "shrimp",
  "tuna",
  "pork",
  "lamb",
  "yogurt",
  "steak",
  "fish",
  "cod",
  "tilapia",
  "tempeh",
  "sausage",
  "bacon",
  "ham",
  "protein",
  "cottage cheese",
  "cheese",
];

const STOP_WORDS = new Set([
  "with",
  "and",
  "the",
  "a",
  "an",
  "of",
  "for",
  "on",
  "in",
  "my",
  "homemade",
  "grilled",
  "baked",
  "roasted",
  "steamed",
  "bowl",
  "plate",
  "meal",
  "large",
  "small",
  "extra",
]);

function extractProteinsFromText(text: string): string[] {
  const lower = text.toLowerCase();
  return PROTEIN_KEYWORDS.filter((k) => lower.includes(k));
}

function tokenizeMealName(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

function topFrequency(items: string[], limit: number): string[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = item.toLowerCase().trim();
    if (!k) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k]) => k);
}

function isTrainingDay(activityLog: ActivityLogEntry[], date: string): boolean {
  return activityLog.some(
    (e) =>
      e.date.slice(0, 10) === date.slice(0, 10) &&
      e.type === "activity" &&
      (e.category === "workout" || e.calorieAdjustment >= 100),
  );
}

function recentMealNames(meals: MealEntry[], withinHours: number): string[] {
  const cutoff = Date.now() - withinHours * 3600000;
  return meals
    .filter((m) => new Date(m.loggedAt || m.date).getTime() >= cutoff)
    .map((m) => m.name.trim())
    .filter(Boolean);
}

/**
 * Derive a lightweight activity profile from meals, pantry, workouts, and saved recipes.
 */
export function buildUserRecipeContext(input: BuildUserRecipeContextInput): UserRecipeContext {
  const {
    meals,
    pantry = [],
    activityLog = [],
    savedRecipes = [],
    profile,
    date,
    mealType,
    remainingCalories,
    remainingProtein,
    goal: goalOverride,
  } = input;

  const goal = goalOverride ?? profile?.goal ?? "maintain";
  const dietaryRestrictions = profile?.dietaryRestrictions ?? [];
  const timeOfDay = mealType ?? inferMealTypeForNow();
  const trainingDay = isTrainingDay(activityLog, date);

  const historyCutoff = Date.now() - 90 * 86400000;
  const recentHistory = meals.filter(
    (m) => new Date(m.loggedAt || m.date).getTime() >= historyCutoff,
  );

  const proteinHits: string[] = [];
  for (const m of recentHistory) {
    proteinHits.push(...extractProteinsFromText(m.name));
  }
  for (const r of savedRecipes) {
    proteinHits.push(...extractProteinsFromText(r.name));
  }

  const topProteins = topFrequency(proteinHits, 3);

  const pantryNames = pantry.map((p) => p.name.trim()).filter(Boolean);
  const proteinPantry = pantry
    .filter((p) => p.category === "protein" || p.category === "dairy")
    .map((p) => p.name.trim());
  const producePantry = pantry.filter((p) => p.category === "produce").map((p) => p.name.trim());

  const ingredientTokens: string[] = [];
  for (const m of recentHistory) {
    ingredientTokens.push(...tokenizeMealName(m.name));
  }
  const topIngredients = topFrequency(
    [...proteinPantry.slice(0, 2), ...producePantry.slice(0, 2), ...ingredientTokens],
    4,
  );

  const avoidRecent = recentMealNames(meals, 48);

  const summaryParts: string[] = [];
  if (trainingDay) summaryParts.push("training day");
  if (topProteins[0]) summaryParts.push(`often logs ${topProteins[0]}`);
  if (proteinPantry[0]) summaryParts.push(`pantry: ${proteinPantry[0]}`);
  if (remainingCalories <= 350) summaryParts.push("light budget left");

  return {
    goal,
    dietaryRestrictions,
    timeOfDay,
    remainingCalories,
    remainingProtein,
    topProteins,
    topIngredients,
    pantryNames,
    avoidRecent,
    trainingDay,
    activitySummary: summaryParts.length > 0 ? summaryParts.join(" · ") : "based on your goals",
  };
}

export interface DiscoverySearchParams {
  query: string;
  mealType: MealTypeValue;
  maxCalories: number;
  minProtein?: number;
}

/**
 * Map activity profile → Edamam search parameters.
 */
export function buildDiscoveryParams(
  ctx: UserRecipeContext,
  opts?: { mealType?: MealTypeValue },
): DiscoverySearchParams {
  const mealType = opts?.mealType ?? ctx.timeOfDay;
  const isSnack = mealType === "snack" || ctx.remainingCalories <= 350;

  const queryParts: string[] = [];

  if (ctx.topProteins[0]) {
    queryParts.push(ctx.topProteins[0]);
  } else if (ctx.goal === "build_muscle") {
    queryParts.push("high protein");
  }

  const pantryHint = ctx.topIngredients.slice(0, 2).join(" ");
  if (pantryHint) queryParts.push(pantryHint);

  if (isSnack) {
    queryParts.push("snack");
  } else {
    queryParts.push(mealType);
  }

  if (ctx.trainingDay && ctx.goal !== "lose_weight") {
    queryParts.push("post workout");
  }

  if (ctx.goal === "lose_weight") {
    queryParts.push("healthy low calorie");
  } else if (ctx.goal === "improve_endurance") {
    queryParts.push("complex carbs");
  }

  for (const r of ctx.dietaryRestrictions.slice(0, 2)) {
    const lower = r.toLowerCase();
    if (lower.includes("vegan") || lower.includes("vegetarian") || lower.includes("gluten")) {
      queryParts.push(lower);
    }
  }

  const query =
    queryParts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim() ||
    (isSnack ? "healthy snack" : `healthy ${mealType}`);

  let minProtein: number | undefined;
  if (ctx.goal === "build_muscle") {
    minProtein = Math.max(20, Math.min(35, Math.round(ctx.remainingProtein * 0.4)));
  } else if (ctx.goal === "lose_weight") {
    minProtein = 15;
  }

  const maxCalories = Math.max(
    150,
    Math.round(ctx.remainingCalories * (isSnack ? 1.0 : 1.08)),
  );

  return { query, mealType, maxCalories, minProtein };
}

/** Filter discovered/suggested recipe names user ate very recently. */
export function filterAvoidRecent<T extends { name: string }>(
  items: T[],
  avoidRecent: string[],
): T[] {
  if (avoidRecent.length === 0) return items;
  const avoidKeys = new Set(avoidRecent.map(normKey));
  return items.filter((item) => {
    const key = normKey(item.name);
    for (const a of avoidKeys) {
      if (key.includes(a) || a.includes(key)) return false;
    }
    return true;
  });
}
