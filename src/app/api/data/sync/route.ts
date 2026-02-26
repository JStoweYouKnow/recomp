import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { isJudgeMode } from "@/lib/judgeMode";
import {
  dbSavePlan,
  dbSaveMeal,
  dbSaveMilestones,
  dbGetMeta,
  dbSaveMeta,
  dbSaveWearableData,
  dbSaveWearableConnection,
} from "@/lib/db";
import { syncBodySchema, SYNC_MAX_BODY_SIZE } from "@/lib/sync-schema";
import type { FitnessPlan, MealEntry, Milestone, WearableConnection, WearableDaySummary, RicoMessage } from "@/lib/types";

export async function POST(req: NextRequest) {
  const rl = fixedWindowRateLimit(getClientKey(getRequestIp(req), "data-sync"), 10, 60_000);
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

    const { plan, meals, milestones, xp, hasAdjusted, ricoHistory, wearableConnections, wearableData } = parsed.data;

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

    await Promise.all(promises);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Sync error:", err);
    return NextResponse.json({ ok: true, mode: "dynamo-unavailable", persisted: false });
  }
}
