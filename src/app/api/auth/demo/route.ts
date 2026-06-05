import { NextRequest, NextResponse } from "next/server";
import { buildSetCookieHeader } from "@/lib/auth";
import { buildDemoSeed } from "@/lib/demoSeed";
import { isJudgeMode } from "@/lib/judgeMode";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import {
  dbSaveProfile,
  dbSavePlan,
  dbSaveMeal,
  dbSaveMilestones,
  dbSaveMeta,
  dbSaveWearableConnection,
  dbSaveWearableData,
  dbSaveWeeklyReview,
  dbSaveActivityLog,
  dbSaveWorkoutProgress,
  dbSaveHydrationEntry,
  dbSaveFastingSession,
  dbSaveBiofeedbackEntry,
  dbSaveSupplements,
  dbSaveMetabolicModel,
} from "@/lib/db";

export async function POST(_req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(_req), "auth-demo"), 40, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  if (isJudgeMode()) {
    return NextResponse.json({ authenticated: false, userId: null, profile: null });
  }

  const seed = buildDemoSeed();
  const { profile } = seed;

  // Persist the full seed to DynamoDB so GET /api/data/sync returns populated data
  // for iOS and any client that syncs after auth. Re-seeds on every demo login so
  // the demo always starts from a clean, consistent state.
  if (process.env.DYNAMODB_TABLE_NAME) {
    await Promise.all([
      dbSaveProfile(profile.id, profile),
      dbSavePlan(profile.id, seed.plan),
      dbSaveMilestones(profile.id, seed.milestones),
      dbSaveMeta(profile.id, seed.meta),
      ...seed.wearableConnections.map((conn) => dbSaveWearableConnection(profile.id, conn)),
      dbSaveWearableData(profile.id, seed.wearableData),
      dbSaveWeeklyReview(profile.id, seed.weeklyReview),
      dbSaveActivityLog(profile.id, seed.activityLog),
      dbSaveWorkoutProgress(profile.id, seed.workoutProgress),
      dbSaveMetabolicModel(profile.id, seed.metabolicModel),
      dbSaveSupplements(profile.id, seed.supplements),
      ...seed.meals.map((meal) => dbSaveMeal(profile.id, meal)),
      ...seed.hydration.map((entry) => dbSaveHydrationEntry(profile.id, entry)),
      ...seed.fastingSessions.map((s) => dbSaveFastingSession(profile.id, s)),
      ...seed.biofeedback.map((e) => dbSaveBiofeedbackEntry(profile.id, e)),
    ]);
  }

  const res = NextResponse.json({
    authenticated: true,
    userId: profile.id,
    profile,
  });
  res.headers.append("Set-Cookie", buildSetCookieHeader(profile.id));
  return res;
}
