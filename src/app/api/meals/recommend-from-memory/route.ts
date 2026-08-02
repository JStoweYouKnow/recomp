import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import {
  dbGetMeals,
  dbGetPlan,
  dbGetSavedRecipes,
} from "@/lib/db";
import { recommendFromMemory } from "@/lib/meal-recommendations";
import { rankWithDiscovery } from "@/lib/recipe-library";
import { remainingMacros } from "@/lib/recipe-fit";
import { scoredRecipesToRecommendations } from "@/lib/recipe-recommendations";
import { loadUserRecipeContextForUser } from "@/lib/server-user-recipe-context";
import {
  buildDiscoveryParams,
  filterAvoidRecent,
} from "@/lib/user-recipe-context";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { withRequestLogging } from "@/lib/logger";
import type { Macros, MealEntry } from "@/lib/types";
import type { MealTypeValue } from "@/lib/meal-quick-picks";

function sumMacrosForDate(meals: MealEntry[], date: string): Macros {
  return meals
    .filter((m) => m.date === date)
    .reduce(
      (acc, m) => ({
        calories: acc.calories + m.macros.calories,
        protein: acc.protein + m.macros.protein,
        carbs: acc.carbs + m.macros.carbs,
        fat: acc.fat + m.macros.fat,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 },
    );
}

export const POST = withRequestLogging(
  "/api/meals/recommend-from-memory",
  async function POST(req: NextRequest) {
    const rl = await fixedWindowRateLimit(
      getClientKey(getRequestIp(req), "recommend-from-memory"),
      60,
      60_000,
    );
    if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

    const userId = await getUserId(req.headers);
    if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    try {
      const body = await req.json();
      const date = typeof body.date === "string" ? body.date.slice(0, 10) : new Date().toISOString().slice(0, 10);
      const mealLimit = typeof body.mealLimit === "number" ? Math.min(body.mealLimit, 12) : 6;
      const snackLimit = typeof body.snackLimit === "number" ? Math.min(body.snackLimit, 8) : 4;
      const includeRecipes = body.includeRecipes !== false;
      const includeExternalRecipes = body.includeExternalRecipes === true;
      const discoverLimit = typeof body.discoverLimit === "number" ? Math.min(body.discoverLimit, 8) : 6;
      const mealType =
        typeof body.mealType === "string" ? (body.mealType as MealTypeValue) : undefined;

      const [meals, plan, savedRecipes] = await Promise.all([
        dbGetMeals(userId),
        dbGetPlan(userId),
        includeRecipes || includeExternalRecipes
          ? dbGetSavedRecipes(userId).catch(() => [])
          : Promise.resolve([]),
      ]);

      const targets = (body.macroTargets as Macros | undefined) ??
        plan?.dietPlan?.dailyTargets ?? {
          calories: 2000,
          protein: 150,
          carbs: 200,
          fat: 65,
        };

      const consumed =
        (body.todayMacros as Macros | undefined) ?? sumMacrosForDate(meals, date);

      const goal = typeof body.goal === "string" ? body.goal : undefined;

      const result = recommendFromMemory({
        meals,
        savedRecipes,
        targets,
        consumed,
        goal,
        mealLimit,
        snackLimit,
        includeRecipes,
      });

      let discovered: ReturnType<typeof scoredRecipesToRecommendations> = [];
      let discoveryQuery: string | undefined;
      let activitySummary: string | undefined;

      if (includeExternalRecipes) {
        const budget = remainingMacros(targets, consumed);
        const activityContext = await loadUserRecipeContextForUser(userId, date, {
          macroTargets: targets,
          todayMacros: consumed,
          goal,
          mealType,
        });
        const discoveryParams = buildDiscoveryParams(activityContext, { mealType });
        discoveryQuery = discoveryParams.query;
        activitySummary = activityContext.activitySummary;

        let external = await rankWithDiscovery(savedRecipes, budget, {
          goal: activityContext.goal,
          mealType: discoveryParams.mealType,
          query: discoveryParams.query,
          includeDiscover: true,
          minProtein: discoveryParams.minProtein,
          maxCalories: discoveryParams.maxCalories,
          limit: discoverLimit + 2,
        });
        external = filterAvoidRecent(external, activityContext.avoidRecent).slice(0, discoverLimit);
        discovered = scoredRecipesToRecommendations(external, discoveryParams.mealType);
      }

      return NextResponse.json({
        ...result,
        discovered,
        discoveryQuery,
        activitySummary,
      });
    } catch (err) {
      console.error("Recommend from memory error:", err);
      return NextResponse.json({ error: "Could not generate recommendations" }, { status: 500 });
    }
  },
);
