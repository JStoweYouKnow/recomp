import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/auth";
import { dbGetMeta, dbSaveMeta } from "@/lib/db";
import { recordSubstitutionsBatch } from "@/lib/exercise-substitutions";
import type { ExerciseSubstitutionPreference } from "@/lib/types";
import {
  fixedWindowRateLimit,
  getClientKey,
  getRateLimitHeaderValues,
  getRequestIp,
} from "@/lib/server-rate-limit";

export const runtime = "nodejs";

const teachItemSchema = z.object({
  original: z.string().min(1).max(200),
  replacement: z.string().min(1).max(200),
  reason: z.string().max(300).optional(),
  source: z.enum(["import", "rico", "manual"]).optional(),
});

const postSchema = z.object({
  substitutions: z.array(teachItemSchema).min(1).max(50),
});

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserId(req.headers);
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const meta = await dbGetMeta(userId);
    return NextResponse.json({
      substitutions: meta.exerciseSubstitutions ?? [],
    });
  } catch (err) {
    console.error("workouts/substitutions GET error:", err);
    return NextResponse.json({ error: "Failed to load substitutions" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(
    getClientKey(getRequestIp(req), "workouts-substitutions"),
    30,
    60_000
  );
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: getRateLimitHeaderValues(rl) }
    );
  }

  try {
    const userId = await getUserId(req.headers);
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const teachable = parsed.data.substitutions.filter(
      (s) => s.original.trim().toLowerCase() !== s.replacement.trim().toLowerCase()
    );
    if (teachable.length === 0) {
      const meta = await dbGetMeta(userId);
      return NextResponse.json({ substitutions: meta.exerciseSubstitutions ?? [] });
    }

    const existing = await dbGetMeta(userId);
    const updated = recordSubstitutionsBatch(
      existing.exerciseSubstitutions ?? [],
      teachable.map((s) => ({
        original: s.original,
        replacement: s.replacement,
        reason: s.reason,
        source: s.source ?? "import",
      }))
    ).slice(-200);

    await dbSaveMeta(userId, {
      ...existing,
      exerciseSubstitutions: updated as ExerciseSubstitutionPreference[],
    });

    return NextResponse.json({ substitutions: updated });
  } catch (err) {
    console.error("workouts/substitutions POST error:", err);
    return NextResponse.json({ error: "Failed to save substitutions" }, { status: 500 });
  }
}
