import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { requireAuthForAI } from "@/lib/judgeMode";
import { logInfo, logError, withRequestLogging } from "@/lib/logger";
import { getCuratedSuggestions, suggestMealsFromNova } from "@/lib/services/meals";
import { internalError } from "@/lib/api-response";

export const POST = withRequestLogging("/api/meals/suggest", async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "meals-suggest"), 15, 60_000);
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

    const curated = getCuratedSuggestions(cal, goalStr, mealType as string | undefined, 5);
    if (curated.length > 0) {
      logInfo("Meal suggestions from curated recipes", { route: "meals/suggest", count: curated.length });
      return NextResponse.json({ suggestions: curated });
    }

    const result = await suggestMealsFromNova({
      mealType,
      remainingCalories: cal,
      remainingProtein,
      restrictions,
      preferences,
      recipes,
      goal: goalStr,
    });
    logInfo("Meal suggestions from Nova", { route: "meals/suggest", mealType });
    return NextResponse.json(result);
  } catch (err) {
    logError("Meal suggest failed", err, { route: "meals/suggest" });
    return internalError("Suggestion failed", err);
  }
});
