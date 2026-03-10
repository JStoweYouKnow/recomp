import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { isJudgeMode } from "@/lib/judgeMode";
import {
  dbGetProfile,
  dbGetPlan,
  dbGetMeals,
  dbGetMilestones,
  dbGetMeta,
  dbGetWearableConnections,
  dbGetWearableData,
  dbGetWeeklyReview,
  dbGetActivityLog,
  dbGetWorkoutProgress,
  dbGetHydration,
  dbGetFastingSessions,
  dbGetBiofeedback,
  dbGetPantry,
  dbGetBodyScans,
  dbGetSupplements,
  dbGetBloodWork,
  dbSavePlan,
  dbSaveMeal,
  dbSaveMilestones,
  dbSaveMeta,
  dbSaveWearableData,
  dbSaveWearableConnection,
  dbSaveActivityLog,
  dbSaveWorkoutProgress,
  dbSaveHydrationEntry,
  dbSaveFastingSession,
  dbSaveBiofeedbackEntry,
  dbSavePantry,
  dbSaveBodyScan,
  dbSaveSupplements,
  dbSaveBloodWork,
} from "@/lib/db";
import { syncBodySchema, SYNC_MAX_BODY_SIZE } from "@/lib/sync-schema";
import type { FitnessPlan, MealEntry, Milestone, WearableConnection, WearableDaySummary } from "@/lib/types";

export async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "data-sync"), 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  try {
    if (isJudgeMode()) {
      await req.json().catch(() => ({}));
      return NextResponse.json({ ok: true, mode: "judge-fallback", persisted: false });
    }

    if (!process.env.DYNAMODB_TABLE_NAME) {
      await req.json().catch(() => ({}));
      return NextResponse.json({ ok: true, mode: "dynamo-unconfigured", persisted: false });
    }

    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 400 });
    }

    const raw = await req.text();
    if (raw.length > SYNC_MAX_BODY_SIZE) {
      return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    }

    const body = JSON.parse(raw);
    const parsed = syncBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid sync payload", details: parsed.error.flatten() }, { status: 400 });
    }

    const { plan, meals, milestones, xp, hasAdjusted, ricoHistory, wearableConnections, wearableData, activityLog, workoutProgress, hydration, fastingSessions, biofeedback, pantry, bodyScans, supplements, bloodWork } = parsed.data;

    const promises: Promise<void>[] = [];

    if (plan) promises.push(dbSavePlan(userId, plan as FitnessPlan));

    if (meals && meals.length > 0) {
      for (const meal of meals) {
        promises.push(dbSaveMeal(userId, meal as MealEntry));
      }
    }

    if (milestones && milestones.length > 0) {
      promises.push(dbSaveMilestones(userId, milestones as Milestone[]));
    }

    if (xp !== undefined || hasAdjusted !== undefined || ricoHistory) {
      promises.push(
        (async () => {
          const existing = await dbGetMeta(userId);
          await dbSaveMeta(userId, {
            ...existing,
            xp: xp ?? existing.xp,
            hasAdjusted: hasAdjusted ?? existing.hasAdjusted,
            ricoHistory: ricoHistory?.slice(-50) ?? existing.ricoHistory ?? [],
          });
        })()
      );
    }

    if (wearableConnections && wearableConnections.length > 0) {
      for (const conn of wearableConnections) {
        promises.push(dbSaveWearableConnection(userId, conn as WearableConnection));
      }
    }

    if (wearableData && wearableData.length > 0) {
      promises.push(dbSaveWearableData(userId, wearableData as WearableDaySummary[]));
    }

    if (activityLog && activityLog.length > 0) {
      promises.push(dbSaveActivityLog(userId, activityLog as any));
    }

    if (workoutProgress) {
      promises.push(dbSaveWorkoutProgress(userId, workoutProgress as Record<string, string>));
    }

    if (hydration && hydration.length > 0) {
      for (const entry of hydration) promises.push(dbSaveHydrationEntry(userId, entry as any));
    }

    if (fastingSessions && fastingSessions.length > 0) {
      for (const session of fastingSessions) promises.push(dbSaveFastingSession(userId, session as any));
    }

    if (biofeedback && biofeedback.length > 0) {
      for (const entry of biofeedback) promises.push(dbSaveBiofeedbackEntry(userId, entry as any));
    }

    if (pantry && pantry.length > 0) {
      promises.push(dbSavePantry(userId, pantry as any));
    }

    if (bodyScans && bodyScans.length > 0) {
      for (const scan of bodyScans) promises.push(dbSaveBodyScan(userId, scan as any));
    }

    if (supplements && supplements.length > 0) {
      promises.push(dbSaveSupplements(userId, supplements as any));
    }

    if (bloodWork && bloodWork.length > 0) {
      for (const bw of bloodWork) promises.push(dbSaveBloodWork(userId, bw as any));
    }

    await Promise.all(promises);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Sync error:", err);
    return NextResponse.json({ ok: true, mode: "dynamo-unavailable", persisted: false });
  }
}

export async function GET(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "data-sync-get"), 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  try {
    if (isJudgeMode() || !process.env.DYNAMODB_TABLE_NAME) {
      return NextResponse.json({ error: "Unavailable" }, { status: 503 });
    }

    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const [
      profile,
      plan,
      meals,
      milestones,
      meta,
      wearableConnections,
      wearableData,
      weeklyReview,
      activityLog,
      workoutProgress,
      hydration,
      fastingSessions,
      biofeedback,
      pantry,
      bodyScans,
      supplements,
      bloodWork,
    ] = await Promise.all([
      dbGetProfile(userId),
      dbGetPlan(userId),
      dbGetMeals(userId),
      dbGetMilestones(userId),
      dbGetMeta(userId),
      dbGetWearableConnections(userId),
      dbGetWearableData(userId),
      dbGetWeeklyReview(userId),
      dbGetActivityLog(userId).catch(() => []),
      dbGetWorkoutProgress(userId).catch(() => ({})),
      dbGetHydration(userId).catch(() => []),
      dbGetFastingSessions(userId).catch(() => []),
      dbGetBiofeedback(userId).catch(() => []),
      dbGetPantry(userId).catch(() => []),
      dbGetBodyScans(userId).catch(() => []),
      dbGetSupplements(userId).catch(() => []),
      dbGetBloodWork(userId).catch(() => []),
    ]);

    if (!profile) {
      return NextResponse.json({ error: "No profile found" }, { status: 404 });
    }

    const payload = {
      profile,
      plan,
      meals: meals.length > 0 ? meals : undefined,
      milestones: milestones.length > 0 ? milestones : undefined,
      wearableConnections: wearableConnections.length > 0 ? wearableConnections : undefined,
      wearableData: wearableData.length > 0 ? wearableData : undefined,
      weeklyReview: weeklyReview ?? undefined,
      activityLog: activityLog.length > 0 ? activityLog : undefined,
      workoutProgress: Object.keys(workoutProgress).length > 0 ? workoutProgress : undefined,
      hydration: hydration.length > 0 ? hydration : undefined,
      fastingSessions: fastingSessions.length > 0 ? fastingSessions : undefined,
      biofeedback: biofeedback.length > 0 ? biofeedback : undefined,
      pantry: pantry.length > 0 ? pantry : undefined,
      bodyScans: bodyScans.length > 0 ? bodyScans : undefined,
      supplements: supplements.length > 0 ? supplements : undefined,
      bloodWork: bloodWork.length > 0 ? bloodWork : undefined,
      meta: {
        xp: meta.xp,
        hasAdjusted: meta.hasAdjusted,
        ricoHistory: meta.ricoHistory,
      },
    };

    return NextResponse.json(payload);
  } catch (err) {
    console.error("Sync GET error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
