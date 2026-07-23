import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { isJudgeMode } from "@/lib/judgeMode";
import {
  dbGetProfile,
  dbSaveProfile,
  dbGetPlan,
  dbGetMeals,
  dbGetMilestones,
  dbGetMeta,
  dbGetWearableConnections,
  dbGetWearableData,
  dbGetWeeklyReview,
  dbGetActivityLog,
  dbGetWorkoutProgress,
  dbGetWorkoutSetLogs,
  dbGetHydration,
  dbGetFastingSessions,
  dbGetBiofeedback,
  dbGetPantry,
  dbGetBodyScans,
  dbGetSupplements,
  dbGetBloodWork,
  dbGetMetabolicModel,
  dbSaveMetabolicModel,
  dbSavePlan,
  dbSaveMeal,
  dbDeleteMeal,
  dbSaveMilestones,
  dbSaveMeta,
  dbSaveWearableData,
  dbSaveWearableConnection,
  dbSaveActivityLog,
  dbSaveWorkoutProgress,
  dbSaveWorkoutSetLogs,
  dbSaveHydrationEntry,
  dbSaveFastingSession,
  dbSaveBiofeedbackEntry,
  dbSavePantry,
  dbGetSavedRecipes,
  dbSaveSavedRecipes,
  dbSaveBodyScan,
  dbSaveSupplements,
  dbSaveBloodWork,
  dbSaveCommunityFood,
  dbSaveCommunityExercise,
  dbGetLatestMealPrepPlan,
  dbSaveMealPrepPlan,
} from "@/lib/db";
import { syncBodySchema, SYNC_MAX_BODY_SIZE } from "@/lib/sync-schema";
import {
  normalizeWearableSummariesForStorage,
  repairWearableScaleRowsForCanonicalLbs,
  type WearableInbound,
} from "@/lib/wearable-normalize";
import { dedupeMealsByDateAndId } from "@/lib/meals-dedupe";
import type { FitnessPlan, MealEntry, Milestone, UserProfile, WearableConnection, ActivityLogEntry, WorkoutSetLog, HydrationEntry, FastingSession, BiofeedbackEntry, PantryItem, CookingAppRecipe, MealPrepPlan, BodyScan, Supplement, BloodWork, MetabolicModel, MeasurementTargets } from "@/lib/types";

export async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "data-sync"), 60, 60_000);
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

    const userId = await getUserId(req.headers);
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
      return NextResponse.json({ error: "Invalid sync payload", details: parsed.error.issues }, { status: 400 });
    }

    const { profile, plan, meals, milestones, xp, hasAdjusted, ricoHistory, wearableConnections, wearableData, activityLog, workoutProgress, workoutSetLogs, hydration, fastingSessions, biofeedback, pantry, savedRecipes, mealPrepPlan, bodyScans, supplements, bloodWork, recentExerciseNames, metabolicModel, measurementTargets } = parsed.data;

    const promises: Promise<void>[] = [];

    // Always persist the profile so GET /api/data/sync can find it on any device.
    // Use the server's authenticated userId — never trust the client's profile.id.
    if (profile) {
      promises.push(dbSaveProfile(userId, { ...(profile as unknown as Parameters<typeof dbSaveProfile>[1]), id: userId }));
    }

    if (metabolicModel) {
      promises.push(dbSaveMetabolicModel(userId, metabolicModel as MetabolicModel));
    }

    if (plan) {
      promises.push(dbSavePlan(userId, plan as FitnessPlan));
      // Auto-populate community exercise database from plan exercises (fire-and-forget)
      const fp = plan as FitnessPlan;
      if (fp.workoutPlan?.weeklyPlan) {
        for (const day of fp.workoutPlan.weeklyPlan) {
          const allExercises = [
            ...(day.warmups ?? []),
            ...(day.exercises ?? []),
            ...(day.finishers ?? []),
          ];
          for (const ex of allExercises) {
            if (ex.name && ex.name.length >= 2) {
              dbSaveCommunityExercise({
                name: ex.name,
                sets: ex.sets,
                reps: ex.reps,
                category: day.focus,
                notes: ex.notes,
              }).catch(() => {}); // Never block sync on community write failure
            }
          }
        }
      }
    }

    // Full meal list sync: upsert incoming rows and **delete** DynamoDB meals that
    // are no longer in the client payload. Otherwise removed/deduped meals reappear
    // on the next GET after reload.
    if (Array.isArray(meals)) {
      promises.push(
        (async () => {
          const uniqueIncoming = dedupeMealsByDateAndId(meals as MealEntry[]);
          const existing = await dbGetMeals(userId);
          const incomingKeys = new Set(
            uniqueIncoming.filter((m) => m?.id && typeof m.date === "string").map((m) => `${m.date}\t${m.id}`)
          );
          await Promise.all(
            existing
              .filter((ex) => ex?.id && typeof ex.date === "string")
              .filter((ex) => !incomingKeys.has(`${ex.date}\t${ex.id}`))
              .map((ex) => dbDeleteMeal(userId, ex))
          );
          for (const m of uniqueIncoming) {
            await dbSaveMeal(userId, m);
            if (m.name && m.macros && m.macros.calories > 0) {
              dbSaveCommunityFood({
                name: m.name,
                calories: m.macros.calories,
                protein: m.macros.protein,
                carbs: m.macros.carbs,
                fat: m.macros.fat,
                source: "user",
              }).catch(() => {});
            }
          }
        })()
      );
    }

    if (milestones && milestones.length > 0) {
      promises.push(dbSaveMilestones(userId, milestones as Milestone[]));
    }

    if (xp !== undefined || hasAdjusted !== undefined || ricoHistory || measurementTargets !== undefined) {
      promises.push(
        (async () => {
          const existing = await dbGetMeta(userId);
          await dbSaveMeta(userId, {
            ...existing,
            xp: xp ?? existing.xp,
            hasAdjusted: hasAdjusted ?? existing.hasAdjusted,
            ricoHistory: ricoHistory?.slice(-50) ?? existing.ricoHistory ?? [],
            measurementTargets:
              measurementTargets !== undefined
                ? (measurementTargets as MeasurementTargets | null)
                : existing.measurementTargets,
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
      const normalizedWearables = normalizeWearableSummariesForStorage(
        wearableData as WearableInbound[],
        profile ? (profile as unknown as UserProfile) : undefined
      );
      const repairedWearables = repairWearableScaleRowsForCanonicalLbs(
        normalizedWearables,
        profile ? (profile as unknown as UserProfile) : undefined
      );
      promises.push(dbSaveWearableData(userId, repairedWearables));
    }

    if (activityLog && activityLog.length > 0) {
      promises.push(dbSaveActivityLog(userId, activityLog as ActivityLogEntry[]));
    }

    // Only touch workout progress when the client included the key. An empty object `{}`
    // is intentional (e.g. web reset). Omitting the key means "no change" — native clients
    // omit it when they have nothing to push so we must not overwrite Dynamo with `{}`
    // (empty object is truthy in JS and used to wipe the map).
    if (Object.prototype.hasOwnProperty.call(parsed.data, "workoutProgress")) {
      promises.push(dbSaveWorkoutProgress(userId, (workoutProgress ?? {}) as Record<string, string>));
    }

    if (Object.prototype.hasOwnProperty.call(parsed.data, "workoutSetLogs")) {
      promises.push(dbSaveWorkoutSetLogs(userId, (workoutSetLogs ?? []) as WorkoutSetLog[]));
    }

    // Auto-populate community exercise DB from user-submitted exercise names (fire-and-forget)
    if (recentExerciseNames && recentExerciseNames.length > 0) {
      for (const name of recentExerciseNames) {
        if (name && name.trim().length >= 2) {
          dbSaveCommunityExercise({ name: name.trim() }).catch(() => {});
        }
      }
    }

    if (hydration && hydration.length > 0) {
      for (const entry of hydration) promises.push(dbSaveHydrationEntry(userId, entry as HydrationEntry));
    }

    if (fastingSessions && fastingSessions.length > 0) {
      for (const session of fastingSessions) promises.push(dbSaveFastingSession(userId, session as FastingSession));
    }

    if (biofeedback && biofeedback.length > 0) {
      for (const entry of biofeedback) promises.push(dbSaveBiofeedbackEntry(userId, entry as BiofeedbackEntry));
    }

    if (pantry && pantry.length > 0) {
      promises.push(dbSavePantry(userId, pantry as PantryItem[]));
    }

    if (savedRecipes && savedRecipes.length > 0) {
      promises.push(dbSaveSavedRecipes(userId, savedRecipes as CookingAppRecipe[]));
    }

    if (mealPrepPlan) {
      promises.push(dbSaveMealPrepPlan(userId, mealPrepPlan as MealPrepPlan));
    }

    if (bodyScans && bodyScans.length > 0) {
      for (const scan of bodyScans) promises.push(dbSaveBodyScan(userId, scan as BodyScan));
    }

    if (supplements && supplements.length > 0) {
      promises.push(dbSaveSupplements(userId, supplements as Supplement[]));
    }

    if (bloodWork && bloodWork.length > 0) {
      for (const bw of bloodWork) promises.push(dbSaveBloodWork(userId, bw as BloodWork));
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

    const userId = await getUserId(req.headers);
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
      workoutSetLogs,
      hydration,
      fastingSessions,
      biofeedback,
      pantry,
      savedRecipes,
      mealPrepPlan,
      bodyScans,
      supplements,
      bloodWork,
      metabolicModel,
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
      dbGetWorkoutSetLogs(userId).catch(() => []),
      dbGetHydration(userId).catch(() => []),
      dbGetFastingSessions(userId).catch(() => []),
      dbGetBiofeedback(userId).catch(() => []),
      dbGetPantry(userId).catch(() => []),
      dbGetSavedRecipes(userId).catch(() => []),
      dbGetLatestMealPrepPlan(userId).catch(() => null),
      dbGetBodyScans(userId).catch(() => []),
      dbGetSupplements(userId).catch(() => []),
      dbGetBloodWork(userId).catch(() => []),
      dbGetMetabolicModel(userId).catch(() => null),
    ]);

    if (!profile) {
      return NextResponse.json({ error: "No profile found" }, { status: 404 });
    }

    const mealsDeduped = meals.length > 0
      ? dedupeMealsByDateAndId(meals).map((m) => {
          if (m.macros.calories > 0) return m;
          const { protein, carbs, fat } = m.macros;
          return { ...m, macros: { calories: Math.round(protein * 4 + carbs * 4 + fat * 9), protein, carbs, fat } };
        })
      : [];
    const wearableDataRepaired =
      wearableData.length > 0 ? repairWearableScaleRowsForCanonicalLbs(wearableData, profile) : [];
    const payload = {
      profile,
      plan,
      // Only include meals when the server actually has rows. Sending `meals: []` would
      // cause iOS fetchAndApply() to wipe local SwiftData before the device has ever
      // successfully pushed — e.g. after a first-sync auth failure. Omitting the key
      // means the iOS `if let mealDTOs = response.meals` guard short-circuits, preserving
      // local state. The web client handles undefined by treating it as an empty array.
      meals: mealsDeduped.length > 0 ? mealsDeduped : undefined,
      milestones,
      wearableConnections: wearableConnections.length > 0 ? wearableConnections : undefined,
      wearableData: wearableDataRepaired.length > 0 ? wearableDataRepaired : undefined,
      weeklyReview: weeklyReview ?? undefined,
      // Always send an array so native clients can replace local rows (including clearing).
      activityLog,
      // Always include workoutProgress (even empty) so clients can clear stale local entries
      // when a reset is performed on another device and synced up as an empty map.
      workoutProgress,
      workoutSetLogs,
      hydration: hydration.length > 0 ? hydration : undefined,
      fastingSessions: fastingSessions.length > 0 ? fastingSessions : undefined,
      biofeedback: biofeedback.length > 0 ? biofeedback : undefined,
      pantry: pantry.length > 0 ? pantry : undefined,
      savedRecipes: savedRecipes.length > 0 ? savedRecipes : undefined,
      mealPrepPlan: mealPrepPlan ?? undefined,
      bodyScans: bodyScans.length > 0 ? bodyScans : undefined,
      supplements: supplements.length > 0 ? supplements : undefined,
      bloodWork: bloodWork.length > 0 ? bloodWork : undefined,
      meta: {
        xp: meta.xp,
        hasAdjusted: meta.hasAdjusted,
        ricoHistory: meta.ricoHistory,
        measurementTargets: meta.measurementTargets ?? undefined,
      },
      metabolicModel: metabolicModel ?? undefined,
    };

    return NextResponse.json(payload);
  } catch (err) {
    console.error("Sync GET error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
