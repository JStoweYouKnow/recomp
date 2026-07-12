import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { requireAuthForAI } from "@/lib/judgeMode";
import { dbGetSavedRecipes } from "@/lib/db";
import { rankWithDiscovery } from "@/lib/recipe-library";
import { remainingMacros } from "@/lib/recipe-fit";
import { withRequestLogging } from "@/lib/logger";

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
    const mealType = typeof body.mealType === "string" ? body.mealType : undefined;
    const query = typeof body.query === "string" ? body.query : undefined;
    const includeDiscover = body.includeDiscover !== false;
    const limit = typeof body.limit === "number" ? Math.min(body.limit, 12) : 8;

    const targets = macroTargets ?? { calories: 2000, protein: 150, carbs: 200, fat: 65 };
    const consumed = todayMacros ?? { calories: 0, protein: 0, carbs: 0, fat: 0 };
    const budget = remainingMacros(targets, consumed);

    let saved = Array.isArray(body.recipes) ? body.recipes : [];
    if (userId && saved.length === 0) {
      saved = await dbGetSavedRecipes(userId).catch(() => []);
    }

    const suggestions = await rankWithDiscovery(saved, budget, {
      goal,
      mealType,
      query,
      includeDiscover,
      limit,
    });

    return NextResponse.json({
      suggestions,
      budget,
      savedCount: saved.length,
    });
  } catch (err) {
    console.error("Recipe suggest error:", err);
    return NextResponse.json({ error: "Could not rank recipes" }, { status: 500 });
  }
});
