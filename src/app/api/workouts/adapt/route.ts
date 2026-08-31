import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/auth";
import { dbGetMeta, dbGetProfile, dbSaveMeta } from "@/lib/db";
import { adaptImportedWorkout } from "@/lib/workout-adapt";
import {
  fixedWindowRateLimit,
  getClientKey,
  getRateLimitHeaderValues,
  getRequestIp,
} from "@/lib/server-rate-limit";

export const maxDuration = 60;
export const runtime = "nodejs";

const exerciseSchema = z.object({
  name: z.string().min(1).max(200),
  sets: z.union([z.string(), z.number()]).transform(String),
  reps: z.union([z.string(), z.number()]).transform(String),
  notes: z.string().max(500).optional(),
  muscles: z.array(z.string().max(80)).max(20).optional(),
});

const workoutDaySchema = z.object({
  day: z.string().min(1).max(80),
  focus: z.string().max(120).default("Workout"),
  warmups: z.array(exerciseSchema).optional(),
  exercises: z.array(exerciseSchema).min(1),
  finishers: z.array(exerciseSchema).optional(),
});

const requestSchema = z.object({
  workout: workoutDaySchema.optional(),
  days: z.array(workoutDaySchema).min(1).max(21).optional(),
  useLlm: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(
    getClientKey(getRequestIp(req), "workouts-adapt"),
    20,
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
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.issues },
        { status: 400 }
      );
    }

    if (!parsed.data.workout && !parsed.data.days?.length) {
      return NextResponse.json({ error: "Provide workout or days" }, { status: 400 });
    }

    const [profile, meta] = await Promise.all([dbGetProfile(userId), dbGetMeta(userId)]);
    if (!profile) {
      return NextResponse.json({ error: "Profile required for equipment adaptation" }, { status: 400 });
    }

    const result = await adaptImportedWorkout(
      { workout: parsed.data.workout, days: parsed.data.days },
      {
        workoutLocation: profile.workoutLocation,
        workoutEquipment: profile.workoutEquipment,
        injuriesOrLimitations: profile.injuriesOrLimitations,
      },
      meta.exerciseSubstitutions ?? [],
      { useLlm: parsed.data.useLlm ?? true }
    );

    return NextResponse.json(result);
  } catch (err) {
    console.error("workouts/adapt error:", err);
    return NextResponse.json({ error: "Failed to adapt workout" }, { status: 500 });
  }
}
