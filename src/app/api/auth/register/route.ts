import { NextRequest, NextResponse } from "next/server";
import { dbSaveProfile } from "@/lib/db";
import { buildSetCookieHeader, getUserId } from "@/lib/auth";
import { logInfo, logError } from "@/lib/logger";
import type { UserProfile } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";

const RegisterSchema = z.object({
  name: z.string().min(1).max(80),
  age: z.number().int().min(10).max(120).optional(),
  weight: z.number().min(20).max(500).optional(),
  height: z.number().min(80).max(260).optional(),
  gender: z.enum(["male", "female", "other"]).optional(),
  fitnessLevel: z.enum(["beginner", "intermediate", "advanced", "athlete"]).optional(),
  goal: z.enum(["lose_weight", "maintain", "build_muscle", "improve_endurance"]).optional(),
  dietaryRestrictions: z.array(z.string().max(80)).max(50).optional(),
  injuriesOrLimitations: z.array(z.string().max(120)).max(50).optional(),
  dailyActivityLevel: z.enum(["sedentary", "light", "moderate", "active", "very_active"]).optional(),
  workoutLocation: z.enum(["home", "gym", "outside"]).optional(),
  workoutEquipment: z.array(z.enum(["bodyweight", "free_weights", "barbells", "kettlebells", "machines", "resistance_bands", "cardio_machines", "pull_up_bar", "cable_machine"])).max(20).optional(),
  workoutDaysPerWeek: z.number().int().min(2).max(7).optional(),
  workoutTimeframe: z.enum(["morning", "afternoon", "evening", "flexible"]).optional(),
  createdAt: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const rl = fixedWindowRateLimit(getClientKey(getRequestIp(req), "auth-register"), 5, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  try {
    const parsed = RegisterSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid profile" }, { status: 400 });
    }
    const profile = parsed.data;

    // Never trust client-provided identity. Reuse authenticated cookie user when present,
    // otherwise mint a new server-side user id.
    const existingUserId = await getUserId(req.headers);
    const userId = existingUserId ?? uuidv4();

    const normalized: UserProfile = {
      id: userId,
      name: profile.name,
      age: profile.age ?? 30,
      weight: profile.weight ?? 70,
      height: profile.height ?? 170,
      gender: profile.gender ?? "other",
      fitnessLevel: profile.fitnessLevel ?? "intermediate",
      goal: profile.goal ?? "maintain",
      dietaryRestrictions: profile.dietaryRestrictions ?? [],
      injuriesOrLimitations: profile.injuriesOrLimitations ?? [],
      dailyActivityLevel: profile.dailyActivityLevel ?? "moderate",
      workoutLocation: profile.workoutLocation,
      workoutEquipment: profile.workoutEquipment,
      workoutDaysPerWeek: profile.workoutDaysPerWeek,
      workoutTimeframe: profile.workoutTimeframe,
      createdAt: profile.createdAt ?? new Date().toISOString(),
    };

    let profileSaved = true;
    try {
      await dbSaveProfile(userId, normalized);
    } catch (err) {
      // Keep local onboarding usable even when DynamoDB credentials are not configured.
      // Cookie auth is still established and the app can proceed with local storage.
      profileSaved = false;
      console.error("Register profile persistence warning:", err);
    }

    logInfo("User registered", { route: "auth/register", userId, profileSaved });
    const res = NextResponse.json({
      ok: true,
      userId,
      profile: normalized,
      profileSaved,
      warning: profileSaved ? undefined : "Profile could not be persisted to DynamoDB",
    });
    res.headers.set("Set-Cookie", buildSetCookieHeader(userId));
    return res;
  } catch (err) {
    logError("Register failed", err, { route: "auth/register" });
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
