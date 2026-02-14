import { NextRequest, NextResponse } from "next/server";
import { invokeNova } from "@/lib/nova";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { logInfo, logError } from "@/lib/logger";

const SYSTEM_PROMPT = `You are a nutrition coach. Suggest 3-5 meal options for a given meal type and constraints.
Respond with valid JSON only.`;

export async function POST(req: NextRequest) {
  const rl = fixedWindowRateLimit(getClientKey(getRequestIp(req), "meals-suggest"), 15, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  try {
    const body = await req.json();
    const { mealType, remainingCalories, remainingProtein, restrictions, preferences } = body;

    const userMessage = `Suggest meal options for ${mealType || "lunch"}.
- Remaining calories to use: ~${remainingCalories ?? "flexible"} kcal
- Remaining protein needed: ~${remainingProtein ?? "flexible"} g
- Restrictions: ${restrictions?.join(", ") || "None"}
- Preferences: ${preferences || "None"}

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
