import { NextRequest, NextResponse } from "next/server";
import { invokeNova } from "@/lib/nova";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { logInfo, logError, withRequestLogging } from "@/lib/logger";

const SYSTEM_PROMPT = `You are an expert fitness coach. Given a user's current plan, their recent meals, and feedback, suggest dynamic adjustments.

Respond with valid JSON only. Be practical and incremental - don't overhaul everything unless necessary.`;

export const POST = withRequestLogging("/api/plans/adjust", async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "plans-adjust"), 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  try {
    const body = await req.json();
    const { plan, mealsThisWeek, feedback, avgDailyCalories, avgDailyProtein } = body;

    if (!plan) {
      return NextResponse.json({ error: "Plan required" }, { status: 400 });
    }

    const userMessage = `Current plan daily targets: ${JSON.stringify(plan.dietPlan?.dailyTargets)}
Workout plan summary: ${plan.workoutPlan?.weeklyPlan?.map((d: { day: string; focus: string }) => `${d.day}: ${d.focus}`).join(", ") || "N/A"}

User's recent data:
- Average daily calories this week: ${avgDailyCalories ?? "unknown"}
- Average daily protein this week: ${avgDailyProtein ?? "unknown"}
- Meals logged: ${mealsThisWeek?.length ?? 0} entries
- User feedback: "${feedback || "No specific feedback"}"

Suggest adjustments. Respond with this JSON only:
{
  "suggestion": {
    "explanation": "brief explanation of what to change and why",
    "newTargets": {"calories": number, "protein": number, "carbs": number, "fat": number} | null,
    "changes": ["specific change 1", "specific change 2"]
  }
}`;

    const raw = await invokeNova(SYSTEM_PROMPT, userMessage, {
      temperature: 0.5,
      maxTokens: 2048,
    });

    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : { suggestion: { explanation: "No adjustment suggested.", newTargets: null, changes: [] } };

    logInfo("Plan adjusted", { route: "plans/adjust" });
    return NextResponse.json(parsed);
  } catch (err) {
    logError("Plan adjust failed", err, { route: "plans/adjust" });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Adjustment failed" },
      { status: 500 }
    );
  }
});
