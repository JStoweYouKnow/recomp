import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { invokeNova } from "@/lib/nova";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { logError } from "@/lib/logger";

const SYSTEM = `You are a context-aware meal suggestion AI. Given the user's remaining macro budget, time of day, recent meals (to avoid repetition), pantry items, and fitness goal, suggest 3-5 meals.

Prioritize:
1. Using pantry items the user already has
2. Matching time-of-day norms (eggs for morning, lighter for evening)
3. Fitting within the remaining macro budget
4. Avoiding meals similar to what was eaten in the last 2 days

Return JSON array: [{ "name": string, "description": string, "estimatedMacros": { "calories": number, "protein": number, "carbs": number, "fat": number }, "usesPantryItems": [string], "reason": string }]`;

export async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "smart-suggest"), 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const userId = await getUserId(req.headers);
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    const { remainingMacros, timeOfDay, recentMeals, pantryItems, goal, dietaryRestrictions } = await req.json();

    const prompt = `Remaining macro budget: ${JSON.stringify(remainingMacros)}
Time of day: ${timeOfDay ?? "unknown"}
Recent meals (avoid repeating): ${JSON.stringify(recentMeals ?? [])}
Pantry items available: ${JSON.stringify(pantryItems ?? [])}
Fitness goal: ${goal ?? "maintain"}
Dietary restrictions: ${JSON.stringify(dietaryRestrictions ?? [])}

Suggest 3-5 meals that fit this context.`;

    const raw = await invokeNova(SYSTEM, prompt, { temperature: 0.7, maxTokens: 1024 });
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return NextResponse.json({ suggestions: [] });
    const suggestions = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ suggestions });
  } catch (err) {
    logError("Smart suggest failed", err, { route: "meals/smart-suggest" });
    return NextResponse.json({ error: "Suggestion failed" }, { status: 500 });
  }
}
