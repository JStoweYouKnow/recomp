import { NextRequest, NextResponse } from "next/server";
import { dbSaveProfile, dbCreateAccount, dbCreateApiToken } from "@/lib/db";
import { buildSetCookieHeader, getUserId } from "@/lib/auth";
import { logInfo, logError } from "@/lib/logger";
import type { UserProfile } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";

const RegisterSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
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
  unitSystem: z.enum(["us", "metric"]).optional(),
  workoutLocation: z.enum(["home", "gym", "outside"]).optional(),
  workoutEquipment: z.array(z.enum(["bodyweight", "free_weights", "barbells", "kettlebells", "machines", "resistance_bands", "cardio_machines", "pull_up_bar", "cable_machine"])).max(20).optional(),
  workoutDaysPerWeek: z.number().int().min(2).max(7).optional(),
  workoutTimeframe: z.enum(["morning", "afternoon", "evening", "flexible"]).optional(),
  createdAt: z.string().optional(),
});

/** Coerce JSON quirks (empty strings, string numbers, human-readable enums from voice LLM) before Zod. */
function normalizeRegisterInput(raw: unknown): unknown {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const o = { ...(raw as Record<string, unknown>) };

  const dropEmpty = (key: string) => {
    const v = o[key];
    if (v === "" || v === null) delete o[key];
  };
  dropEmpty("email");
  dropEmpty("password");

  const toFiniteNumber = (key: string) => {
    const v = o[key];
    if (v === "" || v === null || v === undefined) return;
    if (typeof v === "number" && Number.isFinite(v)) return;
    if (typeof v === "string") {
      const n = Number(v);
      if (Number.isFinite(n)) o[key] = n;
    }
  };
  for (const k of ["age", "weight", "height", "workoutDaysPerWeek"]) toFiniteNumber(k);

  const normKey = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ");

  const goalMap: Record<string, string> = {
    "lose weight": "lose_weight",
    loseweight: "lose_weight",
    "lose_weight": "lose_weight",
    maintain: "maintain",
    "build muscle": "build_muscle",
    buildmuscle: "build_muscle",
    "build_muscle": "build_muscle",
    "improve endurance": "improve_endurance",
    improveendurance: "improve_endurance",
    "improve_endurance": "improve_endurance",
  };
  if (typeof o.goal === "string") {
    const g = goalMap[normKey(o.goal)] ?? goalMap[o.goal.toLowerCase().replace(/\s/g, "")];
    if (g) o.goal = g;
  }

  const levelMap: Record<string, string> = {
    beginner: "beginner",
    intermediate: "intermediate",
    advanced: "advanced",
    athlete: "athlete",
  };
  if (typeof o.fitnessLevel === "string") {
    const k = normKey(o.fitnessLevel);
    if (levelMap[k]) o.fitnessLevel = levelMap[k];
  }

  const activityMap: Record<string, string> = {
    sedentary: "sedentary",
    light: "light",
    moderate: "moderate",
    active: "active",
    "very active": "very_active",
    veryactive: "very_active",
    "very_active": "very_active",
  };
  if (typeof o.dailyActivityLevel === "string") {
    const k = normKey(o.dailyActivityLevel);
    const compact = o.dailyActivityLevel.toLowerCase().replace(/\s/g, "");
    if (activityMap[k]) o.dailyActivityLevel = activityMap[k];
    else if (activityMap[compact]) o.dailyActivityLevel = activityMap[compact];
  }

  const genderMap: Record<string, string> = {
    male: "male",
    female: "female",
    other: "other",
    m: "male",
    f: "female",
  };
  if (typeof o.gender === "string") {
    const k = normKey(o.gender);
    if (genderMap[k]) o.gender = genderMap[k];
  }

  const locMap: Record<string, string> = {
    home: "home",
    gym: "gym",
    outside: "outside",
    outdoors: "outside",
  };
  if (typeof o.workoutLocation === "string") {
    const k = normKey(o.workoutLocation);
    if (locMap[k]) o.workoutLocation = locMap[k];
  }

  const unitMap: Record<string, string> = {
    us: "us",
    metric: "metric",
    imperial: "us",
  };
  if (typeof o.unitSystem === "string") {
    const k = normKey(o.unitSystem);
    if (unitMap[k]) o.unitSystem = unitMap[k];
  }

  const timeMap: Record<string, string> = {
    morning: "morning",
    afternoon: "afternoon",
    evening: "evening",
    flexible: "flexible",
  };
  if (typeof o.workoutTimeframe === "string") {
    const k = normKey(o.workoutTimeframe);
    if (timeMap[k]) o.workoutTimeframe = timeMap[k];
  }

  const allowedEq = new Set([
    "bodyweight",
    "free_weights",
    "barbells",
    "kettlebells",
    "machines",
    "resistance_bands",
    "cardio_machines",
    "pull_up_bar",
    "cable_machine",
  ]);
  if (Array.isArray(o.workoutEquipment)) {
    o.workoutEquipment = o.workoutEquipment.filter((e) => typeof e === "string" && allowedEq.has(e));
  }

  return o;
}

export async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "auth-register"), 5, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const parsed = RegisterSchema.safeParse(normalizeRegisterInput(body));
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      const firstField = Object.entries(flat.fieldErrors).find(([, msgs]) => msgs && msgs.length > 0);
      const hint = firstField ? `${firstField[0]}: ${firstField[1]![0]}` : parsed.error.message;
      return NextResponse.json(
        { error: "Invalid profile", message: hint, issues: flat.fieldErrors },
        { status: 400 },
      );
    }
    const profile = parsed.data;

    // Never trust client-provided identity. Reuse authenticated cookie user when present,
    // otherwise mint a new server-side user id.
    const existingUserId = await getUserId(req.headers);
    const userId = existingUserId ?? uuidv4();

    const normalized: UserProfile = {
      id: userId,
      email: profile.email,
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
      unitSystem: profile.unitSystem ?? "us",
      workoutLocation: profile.workoutLocation,
      workoutEquipment: profile.workoutEquipment,
      workoutDaysPerWeek: profile.workoutDaysPerWeek,
      workoutTimeframe: profile.workoutTimeframe,
      createdAt: profile.createdAt ?? new Date().toISOString(),
    };

    let profileSaved = true;
    try {
      await dbSaveProfile(userId, normalized);

      if (profile.email && profile.password) {
        const passwordHash = await bcrypt.hash(profile.password, 10);
        const accountCreated = await dbCreateAccount({
          userId,
          email: profile.email,
          passwordHash,
          createdAt: new Date().toISOString()
        });
        if (!accountCreated) {
          return NextResponse.json({ error: "Email already in use" }, { status: 409 });
        }
      }
    } catch (err) {
      // Keep local onboarding usable even when DynamoDB credentials are not configured.
      // Cookie auth is still established and the app can proceed with local storage.
      profileSaved = false;
      console.error("Register profile persistence warning:", err);
    }

    let apiToken: string | undefined;
    try {
      apiToken = await dbCreateApiToken(userId);
    } catch {
      // Non-fatal — client can still authenticate via session cookie
    }

    logInfo("User registered", { route: "auth/register", userId, profileSaved });
    const res = NextResponse.json({
      ok: true,
      authenticated: true,
      userId,
      profile: normalized,
      profileSaved,
      apiToken,
      warning: profileSaved ? undefined : "Profile could not be persisted to DynamoDB",
    });
    res.headers.set("Set-Cookie", buildSetCookieHeader(userId));
    return res;
  } catch (err) {
    logError("Register failed", err, { route: "auth/register" });
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
