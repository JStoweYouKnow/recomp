import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import {
  dbSavePlan,
  dbSaveMeal,
  dbSaveMilestones,
  dbSaveMeta,
  dbSaveWearableData,
  dbSaveWearableConnection,
} from "@/lib/db";
import type { FitnessPlan, MealEntry, Milestone, WearableConnection, WearableDaySummary, RicoMessage } from "@/lib/types";

export async function POST(req: NextRequest) {
  const rl = fixedWindowRateLimit(getClientKey(getRequestIp(req), "data-sync"), 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  try {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = await req.json();
    const { plan, meals, milestones, xp, hasAdjusted, ricoHistory, wearableConnections, wearableData } = body;

    const promises: Promise<void>[] = [];

    if (plan) promises.push(dbSavePlan(userId, plan as FitnessPlan));

    if (meals && Array.isArray(meals)) {
      for (const meal of meals as MealEntry[]) {
        promises.push(dbSaveMeal(userId, meal));
      }
    }

    if (milestones && Array.isArray(milestones)) {
      promises.push(dbSaveMilestones(userId, milestones as Milestone[]));
    }

    if (xp !== undefined || hasAdjusted !== undefined || ricoHistory) {
      promises.push(
        dbSaveMeta(userId, {
          xp: xp ?? 0,
          hasAdjusted: hasAdjusted ?? false,
          ricoHistory: (ricoHistory as RicoMessage[])?.slice(-50) ?? [],
        })
      );
    }

    if (wearableConnections && Array.isArray(wearableConnections)) {
      for (const conn of wearableConnections as WearableConnection[]) {
        promises.push(dbSaveWearableConnection(userId, conn));
      }
    }

    if (wearableData && Array.isArray(wearableData)) {
      promises.push(dbSaveWearableData(userId, wearableData as WearableDaySummary[]));
    }

    await Promise.all(promises);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Sync error:", err);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
