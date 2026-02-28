import { NextRequest, NextResponse } from "next/server";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { logError, logInfo } from "@/lib/logger";
import { generateDayPlan, type GeneratedMeal } from "@/lib/recipe-suggestions";
import type { Macros } from "@/lib/types";

export async function POST(req: NextRequest) {
  const rl = fixedWindowRateLimit(getClientKey(getRequestIp(req), "meals-generate-plan"), 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  try {
    const body = await req.json();
    const { dates, targets, goal } = body as {
      dates: string[];
      targets: Macros;
      goal?: string;
    };

    if (!Array.isArray(dates) || dates.length === 0) {
      return NextResponse.json({ error: "dates array required" }, { status: 400 });
    }

    const t = targets ?? { calories: 2000, protein: 150, carbs: 200, fat: 65 };
    const goalStr = (goal as string) || "maintain";

    const plan: Record<string, GeneratedMeal[]> = {};
    for (const date of dates.slice(0, 14)) {
      if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      plan[date] = generateDayPlan(t, goalStr);
    }

    logInfo("Meal plan generated", { route: "meals/generate-plan", dates: Object.keys(plan).length });
    return NextResponse.json({ plan });
  } catch (err) {
    logError("Generate meal plan failed", err, { route: "meals/generate-plan" });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generate plan failed" },
      { status: 500 }
    );
  }
}
