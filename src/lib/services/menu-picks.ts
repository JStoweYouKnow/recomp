import { dbGetMeals, dbGetPlan, dbGetProfile } from "@/lib/db";
import { invokeNovaWithWebGroundingOrFallback } from "@/lib/nova";
import { remainingMacros, type MacroBudget } from "@/lib/recipe-fit";
import { normalizeMenuItems, rankMenuItems, type RankedMenuItem } from "@/lib/menu-fit";
import { logError } from "@/lib/logger";

const DEFAULT_TARGETS: MacroBudget = { calories: 2000, protein: 150, carbs: 200, fat: 65 };

function parseBudget(v: unknown): MacroBudget | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? Math.max(0, x) : NaN);
  const b = { calories: n(o.calories), protein: n(o.protein), carbs: n(o.carbs), fat: n(o.fat) };
  return Object.values(b).every((x) => !Number.isNaN(x)) ? b : undefined;
}

/**
 * Remaining macros for `date`: trusts a client-supplied budget when present,
 * otherwise derives it from the user's plan targets minus meals logged that day.
 */
export async function resolveMenuBudget(
  userId: string | null,
  opts: { remainingMacros?: unknown; goal?: unknown; date: string }
): Promise<{ budget: MacroBudget; goal: string }> {
  const clientBudget = parseBudget(opts.remainingMacros);
  const clientGoal = typeof opts.goal === "string" && opts.goal ? opts.goal : undefined;
  if (clientBudget && clientGoal) return { budget: clientBudget, goal: clientGoal };
  if (!userId) return { budget: clientBudget ?? DEFAULT_TARGETS, goal: clientGoal ?? "maintain" };

  const [plan, meals, profile] = await Promise.all([
    clientBudget ? null : dbGetPlan(userId).catch(() => null),
    clientBudget ? [] : dbGetMeals(userId).catch(() => []),
    clientGoal ? null : dbGetProfile(userId).catch(() => null),
  ]);

  let budget = clientBudget;
  if (!budget) {
    const targets = plan?.dietPlan?.dailyTargets ?? DEFAULT_TARGETS;
    const consumed = meals
      .filter((m) => m.date.slice(0, 10) === opts.date)
      .reduce(
        (sum, m) => ({
          calories: sum.calories + m.macros.calories,
          protein: sum.protein + m.macros.protein,
          carbs: sum.carbs + m.macros.carbs,
          fat: sum.fat + m.macros.fat,
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 }
      );
    budget = remainingMacros(targets, consumed);
  }
  return { budget, goal: clientGoal ?? profile?.goal ?? "maintain" };
}

const RESTAURANT_SYSTEM = `You are a restaurant nutrition researcher. Search the web for the restaurant's published nutrition information.
Return ONLY a JSON object:
{"restaurant": string, "items": [{"name": string, "calories": number, "protein": number, "carbs": number, "fat": number, "source": "official"|"estimate"}]}
List 8-12 real menu items or common orders, favoring higher-protein and lighter options alongside popular staples.
Use the restaurant's official nutrition numbers when available and mark them "official"; otherwise estimate typical portions and mark "estimate".
For build-your-own restaurants (bowls, burritos, salads), list complete orders with the toppings named, e.g. "Chicken burrito bowl, brown rice, black beans, fajita veggies, salsa".`;

export interface RestaurantPicks {
  restaurant: string;
  items: RankedMenuItem[];
}

/** Look up a restaurant's menu nutrition and rank it against the remaining budget. */
export async function findRestaurantPicks(
  restaurant: string,
  budget: MacroBudget,
  opts?: { goal?: string; craving?: string; limit?: number }
): Promise<RestaurantPicks | null> {
  const name = restaurant.trim();
  if (!name) return null;
  try {
    const prompt = `Restaurant: ${name}${opts?.craving ? `\nThe user is in the mood for: ${opts.craving}` : ""}`;
    const { text, source } = await invokeNovaWithWebGroundingOrFallback(RESTAURANT_SYSTEM, prompt, {
      temperature: 0.2,
      maxTokens: 2048,
    });
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as { restaurant?: unknown; items?: unknown };
    let items = normalizeMenuItems(parsed.items).filter((i) => i.estimatedMacros.calories > 0);
    // Without live web access the numbers are model estimates, whatever the model claims.
    if (source !== "web-grounding") items = items.map((i) => ({ ...i, source: "estimate" }));
    if (!items.length) return null;
    return {
      restaurant: typeof parsed.restaurant === "string" && parsed.restaurant.trim() ? parsed.restaurant.trim() : name,
      items: rankMenuItems(items, budget, { goal: opts?.goal }).slice(0, opts?.limit ?? 5),
    };
  } catch (err) {
    logError("Restaurant picks failed", err, { restaurant: name });
    return null;
  }
}

export interface RestaurantPicksResult extends RestaurantPicks {
  remainingMacros: MacroBudget;
}

/**
 * Resolve Rico's `recommend_restaurant_order` action (if any) into ranked picks.
 * Returns `undefined` when the action wasn't requested, `null` when lookup failed.
 */
export async function resolveRestaurantPicksAction(
  userId: string | null,
  actions: { type: string; payload: Record<string, unknown> }[],
  opts: { date: string; remainingMacros?: unknown; goal?: unknown }
): Promise<{ requested: string; picks: RestaurantPicksResult | null } | undefined> {
  const action = actions.find((a) => a.type === "recommend_restaurant_order");
  if (!action) return undefined;
  const restaurant = typeof action.payload.restaurant === "string" ? action.payload.restaurant.trim() : "";
  if (!restaurant) return { requested: "that restaurant", picks: null };
  const craving = typeof action.payload.craving === "string" ? action.payload.craving : undefined;
  const { budget, goal } = await resolveMenuBudget(userId, opts);
  const picks = await findRestaurantPicks(restaurant, budget, { goal, craving });
  return { requested: restaurant, picks: picks ? { ...picks, remainingMacros: budget } : null };
}

/** Headline for Rico's reply; the picks themselves render as cards in the apps. */
export function restaurantPicksHeadline(result: { requested: string; picks: RestaurantPicksResult | null }): string {
  if (!result.picks) {
    return `I couldn't pull ${result.requested}'s nutrition right now. Screenshot the menu in Uber Eats or DoorDash and scan it from Meals → Menu, and I'll rank every item for you.`;
  }
  const { restaurant, remainingMacros: b, items } = result.picks;
  const approved = items.filter((i) => i.recommended).length;
  const left = `${Math.round(b.calories)} cal and ${Math.round(b.protein)}g protein left today`;
  return approved > 0
    ? `With ${left}, here's what fits at ${restaurant}:`
    : `Heads up: with ${left}, nothing at ${restaurant} fits cleanly. These are the closest options:`;
}

/** Plain-text list for surfaces without cards (SMS, Siri Shortcuts). */
export function formatRestaurantPicksText(picks: RestaurantPicksResult): string {
  return picks.items
    .map((i) => {
      const m = i.estimatedMacros;
      return `${i.recommended ? "✅ " : ""}${i.name}: ${m.calories} cal, ${m.protein}g P, ${m.carbs}g C, ${m.fat}g F${i.source === "official" ? "" : " (est.)"}`;
    })
    .join("\n");
}
