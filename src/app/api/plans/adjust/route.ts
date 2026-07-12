import { NextRequest, NextResponse } from "next/server";
import { invokeNova } from "@/lib/nova";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { logInfo, logError, withRequestLogging } from "@/lib/logger";

const SYSTEM_PROMPT = `You are an expert fitness coach. Given a user's current plan, their recent meals, and feedback, suggest dynamic adjustments.

Respond with valid JSON only. Be practical and incremental - don't overhaul everything unless necessary.`;

const MAX_MEALS_IN_PROMPT = 30;

type ExerciseLike = { name?: unknown };
type WorkoutDayLike = {
  day?: unknown;
  focus?: unknown;
  warmups?: unknown;
  exercises?: unknown;
  finishers?: unknown;
};
type MacroLike = { calories?: unknown; protein?: unknown; carbs?: unknown; fat?: unknown };
type MealLike = MacroLike & {
  date?: unknown;
  name?: unknown;
  mealType?: unknown;
  /** Web sends raw meals with macros nested here; iOS sends them flat on the meal. */
  macros?: MacroLike;
};

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** Reads a macro from either the nested `macros` object (web) or a flat field (iOS). */
function macro(m: MealLike, key: keyof MacroLike): number {
  const nested = m?.macros?.[key];
  if (typeof nested === "number" && Number.isFinite(nested)) return nested;
  return num(m?.[key]);
}

function exerciseNames(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return (list as ExerciseLike[])
    .map((e) => (typeof e?.name === "string" ? e.name.trim() : ""))
    .filter((n) => n.length > 0);
}

/** Day + focus + the actual exercises, so custom/imported workout days are visible to the model. */
function summarizeWorkoutPlan(weeklyPlan: unknown): string {
  if (!Array.isArray(weeklyPlan) || weeklyPlan.length === 0) return "N/A";
  return (weeklyPlan as WorkoutDayLike[])
    .map((d) => {
      const day = typeof d?.day === "string" ? d.day : "Day";
      const focus = typeof d?.focus === "string" ? d.focus : "";
      const moves = [...exerciseNames(d?.warmups), ...exerciseNames(d?.exercises), ...exerciseNames(d?.finishers)];
      const detail = moves.length ? `: ${moves.join(", ")}` : "";
      return `- ${day} (${focus})${detail}`;
    })
    .join("\n");
}

function summarizeMeals(meals: MealLike[]): string {
  if (meals.length === 0) return "  (none logged)";
  return meals
    .slice(0, MAX_MEALS_IN_PROMPT)
    .map((m) => {
      const date = typeof m?.date === "string" ? m.date : "?";
      const name = typeof m?.name === "string" && m.name.trim() ? m.name.trim() : "Meal";
      const type = typeof m?.mealType === "string" ? m.mealType : "meal";
      return `  - ${date} ${type}: ${name} (${Math.round(macro(m, "calories"))} kcal, ${Math.round(macro(m, "protein"))}g P, ${Math.round(macro(m, "carbs"))}g C, ${Math.round(macro(m, "fat"))}g F)`;
    })
    .join("\n");
}

export const POST = withRequestLogging("/api/plans/adjust", async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "plans-adjust"), 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  try {
    const body = await req.json();
    const { plan, mealsThisWeek, feedback, avgDailyCalories, avgDailyProtein } = body;

    if (!plan) {
      return NextResponse.json({ error: "Plan required" }, { status: 400 });
    }

    const meals: MealLike[] = Array.isArray(mealsThisWeek) ? mealsThisWeek : [];
    const workoutSummary = summarizeWorkoutPlan(plan.workoutPlan?.weeklyPlan);
    const mealSummary = summarizeMeals(meals);

    const userMessage = `Current plan daily targets: ${JSON.stringify(plan.dietPlan?.dailyTargets)}
Workout plan (includes any custom/imported days the user added):
${workoutSummary}

User's recent data:
- Average daily calories this week: ${avgDailyCalories ?? "unknown"}
- Average daily protein this week: ${avgDailyProtein ?? "unknown"}
- Meals logged: ${meals.length} entries
- Recent meals:
${mealSummary}
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
