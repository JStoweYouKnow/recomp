import { NextRequest, NextResponse } from "next/server";
import { invokeNova } from "@/lib/nova";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { logInfo, logError, withRequestLogging } from "@/lib/logger";
import { applyScheduleAction, countRecentMissed, detectMissedSessions } from "@/lib/workout-schedule";
import type { FitnessPlan, ScheduleAction } from "@/lib/types";

const SYSTEM_PROMPT = `You are an expert fitness coach helping a user adjust their workout schedule after missed sessions.

Given missed session count, plan type, and optional user feedback, recommend ONE action:
- stay_on_week: repeat/stay on current program week (best for structured multi-week programs)
- skip_week: accept missed work and continue on calendar schedule
- catch_up: keep missed sessions in a backlog to complete later
- repeat_week: same as stay_on_week

Respond with valid JSON only:
{
  "recommendedAction": "stay_on_week" | "skip_week" | "catch_up" | "repeat_week",
  "summary": "brief user-facing explanation",
  "weeksMissed": number
}`;

const VALID_ACTIONS: ScheduleAction[] = [
  "stay_on_week",
  "skip_week",
  "catch_up",
  "repeat_week",
  "skip_today",
  "reschedule",
];

export const POST = withRequestLogging("/api/plans/adjust-schedule", async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "plans-adjust-schedule"), 15, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  try {
    const body = await req.json();
    const {
      plan,
      action,
      workoutProgress = {},
      feedback,
      planIndex,
      scheduledDate,
      rescheduledTo,
      weeksMissed,
      useAiRecommendation = false,
      today,
    } = body as {
      plan?: FitnessPlan;
      action?: ScheduleAction;
      workoutProgress?: Record<string, string>;
      feedback?: string;
      planIndex?: number;
      scheduledDate?: string;
      rescheduledTo?: string;
      weeksMissed?: number;
      useAiRecommendation?: boolean;
      today?: string;
    };

    if (!plan?.workoutPlan?.weeklyPlan) {
      return NextResponse.json({ error: "Plan required" }, { status: 400 });
    }

    let chosenAction = action;
    let aiSummary: string | undefined;
    let aiWeeksMissed = weeksMissed;

    const missedCount = countRecentMissed(plan, workoutProgress, 7, today);
    const detected = detectMissedSessions(plan, workoutProgress, today);

    if ((!chosenAction || useAiRecommendation) && missedCount > 0) {
      const isMultiWeek = Boolean(plan.workoutPlan.programWeek1Start && plan.workoutPlan.weeklyPlan.length > 7);
      const userMessage = `Missed sessions in last 7 days: ${missedCount}
Multi-week program: ${isMultiWeek}
Detected sessions: ${detected.map((s) => `${s.dayLabel} on ${s.scheduledDate}`).join(", ") || "none"}
User feedback: "${feedback ?? "I missed workouts and need to adjust my plan"}"`;

      try {
        const raw = await invokeNova(SYSTEM_PROMPT, userMessage, { temperature: 0.3, maxTokens: 512 });
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]) as {
            recommendedAction?: ScheduleAction;
            summary?: string;
            weeksMissed?: number;
          };
          if (!chosenAction && parsed.recommendedAction && VALID_ACTIONS.includes(parsed.recommendedAction)) {
            chosenAction = parsed.recommendedAction;
          }
          aiSummary = parsed.summary;
          if (aiWeeksMissed == null && typeof parsed.weeksMissed === "number") {
            aiWeeksMissed = parsed.weeksMissed;
          }
        }
      } catch {
        // Fall back to deterministic default
      }
    }

    if (!chosenAction) {
      chosenAction = plan.workoutPlan.programWeek1Start ? "stay_on_week" : "catch_up";
    }

    const result = applyScheduleAction(plan, chosenAction, workoutProgress, {
      today,
      planIndex,
      scheduledDate,
      rescheduledTo,
      weeksMissed: aiWeeksMissed ?? weeksMissed,
      feedback,
    });

    logInfo("Workout schedule adjusted", { route: "plans/adjust-schedule", action: chosenAction });
    return NextResponse.json({
      action: chosenAction,
      summary: aiSummary ?? result.summary,
      workoutPlan: result.workoutPlan,
      addedMissed: result.addedMissed,
      detectedMissed: detected,
      missedCount,
    });
  } catch (err) {
    logError("Schedule adjust failed", err, { route: "plans/adjust-schedule" });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Schedule adjustment failed" },
      { status: 500 }
    );
  }
});
