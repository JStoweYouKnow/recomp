import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { invokeNova } from "@/lib/nova";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { requireAuthForAI } from "@/lib/judgeMode";
import { logInfo, logError } from "@/lib/logger";
import { getRecipesForBudget } from "@/lib/recipe-suggestions";

const SYSTEM_PROMPT = `You are a nutrition coach. Suggest 3-5 meal options for a given meal type and constraints, TAILORED to the user's goal.

Goals:
- lose_weight: Prefer high-volume, filling, lower-calorie options (salads, grilled chicken, eggs, veggies, lean protein). Avoid calorie-dense foods.
- maintain: Balanced, varied options the user can enjoy sustainably.
- build_muscle: Protein-dense options (chicken, beef, eggs, Greek yogurt, protein shakes). Include carbs for recovery.
- improve_endurance: Carb-focused options for fuel (oatmeal, rice, pasta, bananas, energy bars).

When the user provides recipes from their cooking app, prefer those or similar options that fit the budget. If no recipes, suggest varied options that fit the budget AND suit their goal.
Respond with valid JSON only.`;

export async function POST(req: NextRequest) {
  const rl = fixedWindowRateLimit(getClientKey(getRequestIp(req), "meals-suggest"), 15, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  if (requireAuthForAI()) {
    const userId = await getUserId(req.headers);
    if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { mealType, remainingCalories, remainingProtein, restrictions, preferences, recipes, goal } = body;

    const cal = typeof remainingCalories === "number" ? remainingCalories : 500;
    const goalStr = (goal as string) || "maintain";

    // 1. Try curated hyperlinked recipes first (atypical, real URLs)
    const curated = getRecipesForBudget(cal, goalStr, mealType as string | undefined, 5);
    if (curated.length > 0) {
      const suggestions = curated.map((r) => ({
        name: r.name,
        description: `Per serving · ${r.calories} cal`,
        calories: r.calories,
        protein: r.protein,
        carbs: r.carbs,
        fat: r.fat,
        url: r.url,
      }));
      logInfo("Meal suggestions from curated recipes", { route: "meals/suggest", count: suggestions.length });
      return NextResponse.json({ suggestions });
    }

    // 2. Fallback to Nova for custom/user recipes when no curated match
    const goalBlock = goal ? `\nUser's fitness goal: ${goal}. Tailor suggestions to this goal.\n` : "";
    const recipeBlock =
      recipes && Array.isArray(recipes) && recipes.length > 0
        ? `\nThe user has these recipes from their cooking app. Prefer suggesting these or similar options that fit the budget:\n${recipes
            .slice(0, 30)
            .map(
              (r: { name?: string; description?: string; calories?: number; url?: string }) =>
                `- ${r.name ?? "Recipe"}${r.description ? `: ${r.description}` : ""}${r.calories != null ? ` (~${r.calories} kcal)` : ""}${r.url ? ` [${r.url}]` : ""}`
            )
            .join("\n")}\n`
        : "";

    const userMessage = `Suggest ATYPICAL, interesting meal options for ${mealType || "lunch"}.
- Remaining calories to use: ~${cal} kcal (all suggestions must fit within this).
- Remaining protein needed: ~${remainingProtein ?? "flexible"} g
- Restrictions: ${restrictions?.join(", ") || "None"}
- Preferences: ${preferences || "None"}
- IMPORTANT: Suggest unique, globally-inspired, or lesser-known dishes (e.g. shakshuka, bibimbap, mujadara, chana masala, okonomiyaki) that still achieve the caloric goal.
${goalBlock}${recipeBlock}
Respond with JSON only:
{"suggestions": [{"name": "Meal name", "description": "Brief description", "calories": n, "protein": n, "carbs": n, "fat": n, "url": "optional recipe URL if you know a real one"}, ...]}`;

    const raw = await invokeNova(SYSTEM_PROMPT, userMessage, {
      temperature: 0.8,
      maxTokens: 1024,
    });

    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : { suggestions: [] };

    logInfo("Meal suggestions from Nova", { route: "meals/suggest", mealType: body?.mealType });
    return NextResponse.json(parsed);
  } catch (err) {
    logError("Meal suggest failed", err, { route: "meals/suggest" });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Suggestion failed" },
      { status: 500 }
    );
  }
}
