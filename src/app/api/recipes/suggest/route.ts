import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { requireAuthForAI } from "@/lib/judgeMode";
import { dbGetSavedRecipes } from "@/lib/db";
import { rankWithDiscovery } from "@/lib/recipe-library";
import { remainingMacros } from "@/lib/recipe-fit";
import { withRequestLogging } from "@/lib/logger";
import { loadUserRecipeContextForUser } from "@/lib/server-user-recipe-context";
import {
  buildDiscoveryParams,
  buildUserRecipeContext,
  filterAvoidRecent,
} from "@/lib/user-recipe-context";
import type { ActivityLogEntry, MealEntry, PantryItem, CookingAppRecipe } from "@/lib/types";
import type { MealTypeValue } from "@/lib/meal-quick-picks";

export const POST = withRequestLogging("/api/recipes/suggest", async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "recipes-suggest"), 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  if (requireAuthForAI()) {
    const userId = await getUserId(req.headers);
    if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const userId = await getUserId(req.headers);

    const macroTargets = body.macroTargets as { calories: number; protein: number; carbs: number; fat: number } | undefined;
    const todayMacros = body.todayMacros as { calories: number; protein: number; carbs: number; fat: number } | undefined;
    const goal = typeof body.goal === "string" ? body.goal : undefined;
    const mealType = typeof body.mealType === "string" ? (body.mealType as MealTypeValue) : undefined;
    let query = typeof body.query === "string" ? body.query.trim() : undefined;
    const includeDiscover = body.includeDiscover !== false;
    const autoQueryFromActivity = body.autoQueryFromActivity !== false;
    const limit = typeof body.limit === "number" ? Math.min(body.limit, 12) : 8;
    const date =
      typeof body.date === "string"
        ? body.date.slice(0, 10)
        : new Date().toISOString().slice(0, 10);

    const targets = macroTargets ?? { calories: 2000, protein: 150, carbs: 200, fat: 65 };
    const consumed = todayMacros ?? { calories: 0, protein: 0, carbs: 0, fat: 0 };
    const budget = remainingMacros(targets, consumed);

    let saved = Array.isArray(body.recipes) ? body.recipes : [];
    if (userId && saved.length === 0) {
      saved = await dbGetSavedRecipes(userId).catch(() => []);
    }

    let activityContext: Awaited<ReturnType<typeof loadUserRecipeContextForUser>> | undefined;
    let discoveryParams: ReturnType<typeof buildDiscoveryParams> | undefined;

    if (includeDiscover && autoQueryFromActivity && !query) {
      if (userId) {
        activityContext = await loadUserRecipeContextForUser(userId, date, {
          macroTargets: targets,
          todayMacros: consumed,
          goal,
          mealType,
        });
      } else if (Array.isArray(body.meals)) {
        activityContext = buildUserRecipeContext({
          meals: body.meals as MealEntry[],
          pantry: (body.pantry as PantryItem[] | undefined) ?? [],
          activityLog: (body.activityLog as ActivityLogEntry[] | undefined) ?? [],
          savedRecipes: (body.recipes as CookingAppRecipe[] | undefined) ?? saved,
          profile: body.profile ?? null,
          date,
          mealType,
          remainingCalories: budget.calories,
          remainingProtein: budget.protein,
          goal,
        });
      }

      if (activityContext) {
        discoveryParams = buildDiscoveryParams(activityContext, { mealType });
        query = discoveryParams.query;
      }
    }

    let suggestions = await rankWithDiscovery(saved, budget, {
      goal: activityContext?.goal ?? goal,
      mealType: discoveryParams?.mealType ?? mealType ?? activityContext?.timeOfDay,
      query,
      includeDiscover,
      minProtein: discoveryParams?.minProtein,
      maxCalories: discoveryParams?.maxCalories,
      limit: limit + 3,
    });

    if (activityContext?.avoidRecent.length) {
      suggestions = filterAvoidRecent(suggestions, activityContext.avoidRecent).slice(0, limit);
    } else {
      suggestions = suggestions.slice(0, limit);
    }

    return NextResponse.json({
      suggestions,
      budget,
      savedCount: saved.length,
      discoveryQuery: query,
      activitySummary: activityContext?.activitySummary,
    });
  } catch (err) {
    console.error("Recipe suggest error:", err);
    return NextResponse.json({ error: "Could not rank recipes" }, { status: 500 });
  }
});
