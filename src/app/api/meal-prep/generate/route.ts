import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { invokeNova } from "@/lib/nova";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { logError } from "@/lib/logger";

const SYSTEM = `You are a meal prep planning AI. Generate a weekly meal prep plan with batch-cookable recipes that hit the user's daily macro targets.

Design recipes that:
1. Can be batch-cooked on a single prep day (Sunday)
2. Store well for 4-5 days
3. Meet the daily macro targets when combined
4. Use common, affordable ingredients
5. Minimize variety fatigue with 4-6 distinct recipes

Return JSON: {
  "recipes": [{
    "name": string,
    "servings": number,
    "macrosPerServing": { "calories": number, "protein": number, "carbs": number, "fat": number },
    "ingredients": [{ "name": string, "amount": string, "category": string }],
    "instructions": [string],
    "prepTime": number,
    "cookTime": number
  }],
  "batchInstructions": [string],
  "estimatedPrepTime": number
}`;

export async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "meal-prep-gen"), 5, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const userId = await getUserId(req.headers);
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    const { dailyTargets, dietaryRestrictions, pantryItems, preferences } = await req.json();

    const prompt = `Daily macro targets: ${JSON.stringify(dailyTargets)}
Dietary restrictions: ${JSON.stringify(dietaryRestrictions ?? [])}
Available pantry items: ${JSON.stringify(pantryItems ?? [])}
Preferences: ${preferences ?? "none"}

Generate a weekly meal prep plan.`;

    const raw = await invokeNova(SYSTEM, prompt, { temperature: 0.6, maxTokens: 2048 });
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ error: "Failed to generate plan" }, { status: 500 });
    const plan = JSON.parse(jsonMatch[0]);
    return NextResponse.json(plan);
  } catch (err) {
    logError("Meal prep generate failed", err, { route: "meal-prep/generate" });
    return NextResponse.json({ error: "Plan generation failed" }, { status: 500 });
  }
}
