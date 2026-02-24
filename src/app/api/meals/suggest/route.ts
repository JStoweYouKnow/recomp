import { NextRequest, NextResponse } from "next/server";
import { invokeNova } from "@/lib/nova";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { logInfo, logError } from "@/lib/logger";

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

  try {
    const body = await req.json();
    const { mealType, remainingCalories, remainingProtein, restrictions, preferences, recipes, goal } = body;

    const goalBlock = goal ? `\nUser's fitness goal: ${goal}. Tailor suggestions to this goal (e.g. lose_weight = lighter/voluminous, build_muscle = protein-dense).\n` : "";

    const recipeBlock =
      recipes && Array.isArray(recipes) && recipes.length > 0
        ? `\nThe user has these recipes from their cooking app. Prefer suggesting these or similar gourmet options that fit the budget:\n${recipes
            .slice(0, 30)
            .map(
              (r: { name?: string; description?: string; calories?: number }) =>
                `- ${r.name ?? "Recipe"}${r.description ? `: ${r.description}` : ""}${r.calories != null ? ` (~${r.calories} kcal)` : ""}`
            )
            .join("\n")}\n`
        : "";

    const userMessage = `Suggest meal options for ${mealType || "lunch"}.
- Remaining calories to use: ~${remainingCalories ?? "flexible"} kcal (all suggestions must fit within this).
- Remaining protein needed: ~${remainingProtein ?? "flexible"} g
- Restrictions: ${restrictions?.join(", ") || "None"}
- Preferences: ${preferences || "None"}
${goalBlock}${recipeBlock}
Respond with JSON only:
{"suggestions": [{"name": "Meal name", "description": "Brief description", "calories": n, "protein": n, "carbs": n, "fat": n}, ...]}`;

    const raw = await invokeNova(SYSTEM_PROMPT, userMessage, {
      temperature: 0.7,
      maxTokens: 1024,
    });

    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : { suggestions: [] };

    logInfo("Meal suggestions generated", { route: "meals/suggest", mealType: body?.mealType });
    return NextResponse.json(parsed);
  } catch (err) {
    logError("Meal suggest failed", err, { route: "meals/suggest" });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Suggestion failed" },
      { status: 500 }
    );
  }
}
