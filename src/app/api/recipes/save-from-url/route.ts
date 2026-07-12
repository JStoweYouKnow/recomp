import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { dbGetSavedRecipes, dbSaveSavedRecipes } from "@/lib/db";
import type { CookingAppRecipe } from "@/lib/types";
import { withRequestLogging } from "@/lib/logger";

export const POST = withRequestLogging("/api/recipes/save-from-url", async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "recipes-save-url"), 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const userId = await getUserId(req.headers);
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL required" }, { status: 400 });
    }

    const origin = req.nextUrl.origin;
    const parseRes = await fetch(`${origin}/api/meals/parse-recipe-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: req.headers.get("cookie") ?? "" },
      body: JSON.stringify({ url }),
    });

    if (!parseRes.ok) {
      const err = await parseRes.json().catch(() => ({}));
      return NextResponse.json({ error: err.error ?? "Could not parse recipe URL" }, { status: parseRes.status });
    }

    const parsed = await parseRes.json();
    const now = new Date().toISOString();
    const recipe: CookingAppRecipe = {
      id: `url_${Date.now()}`,
      name: parsed.name ?? "Recipe",
      calories: Math.round(parsed.macros?.calories ?? 0),
      protein: Math.round(parsed.macros?.protein ?? 0),
      carbs: Math.round(parsed.macros?.carbs ?? 0),
      fat: Math.round(parsed.macros?.fat ?? 0),
      recipeUrl: url.trim(),
      source: "url",
      servings: parsed.servings ?? 1,
      addedAt: now,
    };

    const existing = await dbGetSavedRecipes(userId);
    const deduped = existing.filter(
      (r) => (r.recipeUrl ?? "").toLowerCase() !== recipe.recipeUrl!.toLowerCase()
    );
    const next = [recipe, ...deduped].slice(0, 500);
    await dbSaveSavedRecipes(userId, next);

    return NextResponse.json({ recipe, savedCount: next.length });
  } catch (err) {
    console.error("Save recipe from URL error:", err);
    return NextResponse.json({ error: "Failed to save recipe" }, { status: 500 });
  }
});
