import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { requireAuthForAI } from "@/lib/judgeMode";
import { logError, withRequestLogging } from "@/lib/logger";
import { dbGetMeals, dbGetPlan, dbGetProfile, dbGetWorkoutProgress, dbGetWorkoutSetLogs } from "@/lib/db";
import { generatePostWorkoutRecommendation } from "@/lib/services/post-workout-recommendation";
import { persistHeadlessRicoActions } from "@/lib/services/rico";
import { stripRicoDiagnosticMarkup } from "@/lib/rico-reply-sanitizer";
import {
  detectNewlyCompletedSession,
  getCompletedSessionForDate,
  type CompletedSessionSummary,
} from "@/lib/workout-learning";
import { getTodayLocal } from "@/lib/date-utils";
import type { FitnessPlan, WorkoutSetLog } from "@/lib/types";
import type { WorkoutProgressMap } from "@/lib/workout-schedule";

export const POST = withRequestLogging("/api/workouts/post-completion-recommendation", async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "post-workout-rec"), 8, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  if (requireAuthForAI()) {
    const userId = await getUserId(req.headers);
    if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const userId = await getUserId(req.headers);
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    const body = (await req.json()) as {
      completedSession?: CompletedSessionSummary;
      completedDate?: string;
      plan?: FitnessPlan;
      workoutProgress?: WorkoutProgressMap;
      previousProgress?: WorkoutProgressMap;
      workoutSetLogs?: WorkoutSetLog[];
      applyActions?: boolean;
    };

    const plan = body.plan ?? (await dbGetPlan(userId));
    if (!plan) return NextResponse.json({ error: "No workout plan found" }, { status: 404 });

    const progress = body.workoutProgress ?? (await dbGetWorkoutProgress(userId));
    const setLogs = body.workoutSetLogs ?? (await dbGetWorkoutSetLogs(userId));
    const date = body.completedDate ?? body.completedSession?.date ?? getTodayLocal();

    let completedSession = body.completedSession ?? null;
    if (!completedSession && body.previousProgress) {
      completedSession = detectNewlyCompletedSession(plan, body.previousProgress, progress, date, setLogs);
    }
    if (!completedSession) {
      completedSession = getCompletedSessionForDate(plan, progress, date, setLogs);
    }
    if (!completedSession) {
      return NextResponse.json({ error: "No completed workout session found for this date" }, { status: 400 });
    }

    const profile = await dbGetProfile(userId);
    const meals = await dbGetMeals(userId);

    const result = await generatePostWorkoutRecommendation({
      plan,
      progress,
      completedSession,
      setLogs,
      profile: profile ? { name: profile.name, goal: profile.goal } : undefined,
      meals,
    });

    let reply = stripRicoDiagnosticMarkup(result.reply);
    let actions = result.actions;

    if (body.applyActions && actions.length > 0) {
      const { replySuffix } = await persistHeadlessRicoActions(userId, actions);
      reply += replySuffix;
    }

    return NextResponse.json({
      reply,
      actions,
      completedSession: result.completedSession,
      nextWorkout: result.nextWorkout,
    });
  } catch (err) {
    logError("Post-workout recommendation failed", err, { route: "workouts/post-completion-recommendation" });
    return NextResponse.json({ error: "Failed to generate recommendation" }, { status: 500 });
  }
});
