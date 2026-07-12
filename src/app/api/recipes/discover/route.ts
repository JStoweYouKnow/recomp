import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { requireAuthForAI } from "@/lib/judgeMode";
import { discoverRecipes, isEdamamConfigured } from "@/lib/services/edamam";
import { rankRecipes } from "@/lib/recipe-fit";
import { withRequestLogging } from "@/lib/logger";

export const POST = withRequestLogging("/api/recipes/discover", async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "recipes-discover"), 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  if (requireAuthForAI()) {
    const userId = await getUserId(req.headers);
    if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  if (!isEdamamConfigured()) {
    return NextResponse.json(
      { error: "Recipe discovery not configured. Set EDAMAM_APP_ID and EDAMAM_APP_KEY." },
      { status: 503 }
    );
  }

  try {
    const body = await req.json();
    const maxCalories = typeof body.maxCalories === "number" ? body.maxCalories : undefined;
    const minProtein = typeof body.minProtein === "number" ? body.minProtein : undefined;
    const mealType = typeof body.mealType === "string" ? body.mealType : undefined;
    const query = typeof body.query === "string" ? body.query : undefined;
    const limit = typeof body.limit === "number" ? Math.min(body.limit, 10) : 6;

    const discovered = await discoverRecipes({ query, maxCalories, minProtein, mealType, limit });

    const budget = {
      calories: maxCalories ?? 600,
      protein: minProtein ?? 20,
      carbs: 80,
      fat: 25,
    };

    const ranked = rankRecipes(
      discovered.map((r) => ({
        id: r.id,
        name: r.name,
        calories: r.calories,
        protein: r.protein,
        carbs: r.carbs,
        fat: r.fat,
        recipeUrl: r.recipeUrl,
        source: r.source,
        addedAt: new Date().toISOString(),
      })),
      budget,
      { mealType, limit }
    );

    return NextResponse.json({ recipes: ranked, source: "edamam" });
  } catch (err) {
    console.error("Recipe discover error:", err);
    return NextResponse.json({ error: "Discovery failed" }, { status: 500 });
  }
});
