import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { buildSetCookieHeader } from "@/lib/auth";
import { hashPassword } from "@/lib/auth-password";
import { dbCreateAccount, dbSaveProfile, dbVerifyAccount } from "@/lib/db";
import { isJudgeMode } from "@/lib/judgeMode";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import type { FitnessLevel, Goal, MeasurementSystem, UserProfile, WorkoutEquipment, WorkoutLocation } from "@/lib/types";

const ALL_EQUIPMENT: WorkoutEquipment[] = [
  "bodyweight",
  "free_weights",
  "barbells",
  "kettlebells",
  "machines",
  "resistance_bands",
  "cardio_machines",
  "pull_up_bar",
  "cable_machine",
];

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function strArr(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

function parseProfile(body: Record<string, unknown>, userId: string): UserProfile {
  const gender = str(body.gender);
  const g = gender === "male" || gender === "female" || gender === "other" ? gender : "other";

  const fitnessLevel = str(body.fitnessLevel) as FitnessLevel | undefined;
  const fl: FitnessLevel =
    fitnessLevel === "beginner" ||
    fitnessLevel === "intermediate" ||
    fitnessLevel === "advanced" ||
    fitnessLevel === "athlete"
      ? fitnessLevel
      : "beginner";

  const goalRaw = str(body.goal) as Goal | undefined;
  const goal: Goal =
    goalRaw === "lose_weight" ||
    goalRaw === "maintain" ||
    goalRaw === "build_muscle" ||
    goalRaw === "improve_endurance"
      ? goalRaw
      : "maintain";

  const dal = str(body.dailyActivityLevel);
  const dailyActivityLevel =
    dal === "sedentary" ||
    dal === "light" ||
    dal === "moderate" ||
    dal === "active" ||
    dal === "very_active"
      ? dal
      : "moderate";

  const unit = str(body.unitSystem) as MeasurementSystem | undefined;
  const unitSystem: MeasurementSystem = unit === "metric" || unit === "us" ? unit : "us";

  const wl = str(body.workoutLocation) as WorkoutLocation | undefined;
  const workoutLocation: WorkoutLocation | undefined =
    wl === "home" || wl === "gym" || wl === "outside" ? wl : undefined;

  const eq = strArr(body.workoutEquipment).filter((e): e is WorkoutEquipment =>
    ALL_EQUIPMENT.includes(e as WorkoutEquipment)
  );

  const wt = str(body.workoutTimeframe);
  const workoutTimeframe =
    wt === "morning" || wt === "afternoon" || wt === "evening" || wt === "flexible" ? wt : "flexible";

  const createdAt = str(body.createdAt) ?? new Date().toISOString();

  return {
    id: userId,
    name: str(body.name) ?? "User",
    email: str(body.email)?.trim() || undefined,
    avatarDataUrl: str(body.avatarDataUrl),
    age: num(body.age) ?? 30,
    weight: num(body.weight) ?? 70,
    height: num(body.height) ?? 170,
    gender: g,
    fitnessLevel: fl,
    goal,
    dietaryRestrictions: strArr(body.dietaryRestrictions),
    injuriesOrLimitations: strArr(body.injuriesOrLimitations),
    dailyActivityLevel,
    unitSystem,
    workoutLocation,
    workoutEquipment: eq.length > 0 ? eq : ["free_weights", "machines"],
    workoutDaysPerWeek: num(body.workoutDaysPerWeek) ?? 4,
    workoutTimeframe,
    createdAt,
  };
}

export async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "auth-register"), 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  if (isJudgeMode()) {
    await req.json().catch(() => ({}));
    return NextResponse.json({ error: "Registration disabled in judge mode" }, { status: 503 });
  }

  if (!process.env.DYNAMODB_TABLE_NAME) {
    return NextResponse.json({ error: "Registration unavailable" }, { status: 503 });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const password = str(body.password);
    const email = str(body.email)?.trim().toLowerCase() ?? "";
    const userId = str(body.id)?.trim() || randomUUID();

    const profile = parseProfile(body, userId);

    if (password && password.length > 0) {
      if (password.length < 8) {
        return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
      }
      if (!email) {
        return NextResponse.json({ error: "Email is required when setting a password" }, { status: 400 });
      }

      const existing = await dbVerifyAccount(email);
      if (existing) {
        return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
      }

      const created = await dbCreateAccount({
        userId,
        email,
        passwordHash: await hashPassword(password),
        createdAt: new Date().toISOString(),
      });
      if (!created) {
        return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
      }

      const profileWithEmail: UserProfile = { ...profile, id: userId, email };
      await dbSaveProfile(userId, profileWithEmail);

      const res = NextResponse.json({
        authenticated: true,
        userId,
        profile: profileWithEmail,
      });
      res.headers.append("Set-Cookie", buildSetCookieHeader(userId));
      return res;
    }

    const guestProfile: UserProfile = { ...profile, id: userId };
    await dbSaveProfile(userId, guestProfile);

    const res = NextResponse.json({
      authenticated: true,
      userId,
      profile: guestProfile,
    });
    res.headers.append("Set-Cookie", buildSetCookieHeader(userId));
    return res;
  } catch (err) {
    console.error("auth/register", err);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
