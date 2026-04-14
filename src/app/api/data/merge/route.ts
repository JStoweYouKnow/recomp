import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import {
  dbGetMeals, dbSaveMeal,
  dbGetMilestones, dbSaveMilestones,
  dbGetMeta, dbSaveMeta,
  dbGetActivityLog, dbSaveActivityLog,
  dbGetHydration, dbSaveHydrationEntry,
  dbGetFastingSessions, dbSaveFastingSession,
  dbGetBiofeedback, dbSaveBiofeedbackEntry,
  dbGetPantry, dbSavePantry,
  dbGetBodyScans, dbSaveBodyScan,
  dbGetSupplements, dbSaveSupplements,
  dbGetBloodWork, dbSaveBloodWork,
  dbGetWorkoutProgress, dbSaveWorkoutProgress,
  dbGetPlan, dbSavePlan,
} from "@/lib/db";
import { dedupeMealsByDateAndId } from "@/lib/meals-dedupe";
import { z } from "zod";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";

const MergeSchema = z.object({
  fromUserId: z.string().uuid(),
});

/**
 * POST /api/data/merge
 * Merges data from a previous anonymous userId into the current authenticated userId.
 * Only merges — never deletes from the source or overwrites existing target data for meals.
 */
export async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "data-merge"), 5, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const userId = await getUserId(req.headers);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = MergeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "fromUserId must be a valid UUID" }, { status: 400 });

  const { fromUserId } = parsed.data;
  if (fromUserId === userId) return NextResponse.json({ error: "Cannot merge userId into itself" }, { status: 400 });

  const summary: Record<string, number> = {};

  try {
    // ── Meals (merge by date+id — keep all unique meals from both sides) ──
    const [toMeals, fromMeals] = await Promise.all([dbGetMeals(userId), dbGetMeals(fromUserId)]);
    const existing = new Set(toMeals.map((m) => `${m.date}\t${m.id}`));
    const newMeals = fromMeals.filter((m) => !existing.has(`${m.date}\t${m.id}`));
    const merged = dedupeMealsByDateAndId([...toMeals, ...newMeals]);
    await Promise.all(merged.map((m) => dbSaveMeal(userId, m)));
    summary.meals = newMeals.length;

    // ── Plan (copy if target has none; replace if old plan was created later) ──
    const [toPlan, fromPlan] = await Promise.all([dbGetPlan(userId), dbGetPlan(fromUserId)]);
    if (fromPlan && (!toPlan || (fromPlan.createdAt ?? "") > (toPlan.createdAt ?? ""))) {
      await dbSavePlan(userId, fromPlan);
      summary.plan = 1;
    }

    // ── Milestones (union by id) ──
    const [toMilestones, fromMilestones] = await Promise.all([dbGetMilestones(userId), dbGetMilestones(fromUserId)]);
    const existingMs = new Set(toMilestones.map((m) => m.id));
    const newMs = fromMilestones.filter((m) => !existingMs.has(m.id));
    if (newMs.length > 0) {
      await dbSaveMilestones(userId, [...toMilestones, ...newMs]);
      summary.milestones = newMs.length;
    }

    // ── Meta (take higher XP) ──
    const [toMeta, fromMeta] = await Promise.all([dbGetMeta(userId), dbGetMeta(fromUserId)]);
    if ((fromMeta.xp ?? 0) > (toMeta.xp ?? 0)) {
      await dbSaveMeta(userId, { ...toMeta, xp: fromMeta.xp });
      summary.xp = fromMeta.xp ?? 0;
    }

    // ── Activity log (union by id) ──
    const [toLog, fromLog] = await Promise.all([dbGetActivityLog(userId).catch(() => []), dbGetActivityLog(fromUserId).catch(() => [])]);
    const existingLog = new Set(toLog.map((e) => e.id));
    const newLog = fromLog.filter((e) => !existingLog.has(e.id));
    if (newLog.length > 0) {
      await dbSaveActivityLog(userId, [...toLog, ...newLog]);
      summary.activityLog = newLog.length;
    }

    // ── Hydration (union by id) ──
    const [toHyd, fromHyd] = await Promise.all([dbGetHydration(userId).catch(() => []), dbGetHydration(fromUserId).catch(() => [])]);
    const existingHyd = new Set(toHyd.map((e) => e.id));
    const newHyd = fromHyd.filter((e) => !existingHyd.has(e.id));
    await Promise.all(newHyd.map((e) => dbSaveHydrationEntry(userId, e)));
    summary.hydration = newHyd.length;

    // ── Fasting sessions (union by id) ──
    const [toFast, fromFast] = await Promise.all([dbGetFastingSessions(userId).catch(() => []), dbGetFastingSessions(fromUserId).catch(() => [])]);
    const existingFast = new Set(toFast.map((e) => e.id));
    const newFast = fromFast.filter((e) => !existingFast.has(e.id));
    await Promise.all(newFast.map((e) => dbSaveFastingSession(userId, e)));
    summary.fastingSessions = newFast.length;

    // ── Biofeedback (union by id) ──
    const [toBio, fromBio] = await Promise.all([dbGetBiofeedback(userId).catch(() => []), dbGetBiofeedback(fromUserId).catch(() => [])]);
    const existingBio = new Set(toBio.map((e) => e.id));
    const newBio = fromBio.filter((e) => !existingBio.has(e.id));
    await Promise.all(newBio.map((e) => dbSaveBiofeedbackEntry(userId, e)));
    summary.biofeedback = newBio.length;

    // ── Pantry (replace if source is larger) ──
    const [toPantry, fromPantry] = await Promise.all([dbGetPantry(userId).catch(() => []), dbGetPantry(fromUserId).catch(() => [])]);
    if (fromPantry.length > toPantry.length) {
      await dbSavePantry(userId, fromPantry);
      summary.pantry = fromPantry.length;
    }

    // ── Body scans (union by id) ──
    const [toScans, fromScans] = await Promise.all([dbGetBodyScans(userId).catch(() => []), dbGetBodyScans(fromUserId).catch(() => [])]);
    const existingScans = new Set(toScans.map((s) => s.id));
    const newScans = fromScans.filter((s) => !existingScans.has(s.id));
    await Promise.all(newScans.map((s) => dbSaveBodyScan(userId, s)));
    summary.bodyScans = newScans.length;

    // ── Supplements (replace if source is larger) ──
    const [toSupp, fromSupp] = await Promise.all([dbGetSupplements(userId).catch(() => []), dbGetSupplements(fromUserId).catch(() => [])]);
    if (fromSupp.length > toSupp.length) {
      await dbSaveSupplements(userId, fromSupp);
      summary.supplements = fromSupp.length;
    }

    // ── Blood work (union by id) ──
    const [toBW, fromBW] = await Promise.all([dbGetBloodWork(userId).catch(() => []), dbGetBloodWork(fromUserId).catch(() => [])]);
    const existingBW = new Set(toBW.map((e) => e.id));
    const newBW = fromBW.filter((e) => !existingBW.has(e.id));
    await Promise.all(newBW.map((e) => dbSaveBloodWork(userId, e)));
    summary.bloodWork = newBW.length;

    // ── Workout progress (merge keys — keep target's values where both exist) ──
    const [toWP, fromWP] = await Promise.all([dbGetWorkoutProgress(userId).catch(() => ({})), dbGetWorkoutProgress(fromUserId).catch(() => ({}))]);
    const newWPKeys = Object.keys(fromWP).filter((k) => !(k in toWP));
    const mergedWP = { ...fromWP, ...toWP }; // target wins on conflict
    await dbSaveWorkoutProgress(userId, mergedWP);
    summary.workoutProgress = newWPKeys.length;

    return NextResponse.json({ ok: true, merged: summary });
  } catch (err) {
    console.error("Merge error:", err);
    return NextResponse.json({ error: "Merge failed", detail: String(err) }, { status: 500 });
  }
}
