import { NextRequest, NextResponse } from "next/server";
import { buildSetCookieHeader } from "@/lib/auth";
import { verifyPassword } from "@/lib/auth-password";
import { dbGetProfile, dbSaveProfile, dbVerifyAccount } from "@/lib/db";
import { isJudgeMode } from "@/lib/judgeMode";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import type { UserProfile } from "@/lib/types";

export async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "auth-login"), 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  if (isJudgeMode()) {
    await req.json().catch(() => ({}));
    return NextResponse.json({ error: "Authentication disabled in judge mode" }, { status: 503 });
  }

  if (!process.env.DYNAMODB_TABLE_NAME) {
    return NextResponse.json({ error: "Authentication unavailable" }, { status: 503 });
  }

  try {
    const body = (await req.json()) as { email?: string; password?: string };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    const account = await dbVerifyAccount(email);
    if (!account || !(await verifyPassword(password, account.passwordHash))) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    let profile = await dbGetProfile(account.userId);
    if (!profile) {
      profile = {
        id: account.userId,
        name: "Athlete",
        email: account.email,
        age: 30,
        weight: 70,
        height: 170,
        gender: "other",
        fitnessLevel: "intermediate",
        goal: "maintain",
        dietaryRestrictions: [],
        injuriesOrLimitations: [],
        dailyActivityLevel: "moderate",
        unitSystem: "us",
        workoutLocation: "gym",
        workoutEquipment: ["free_weights"],
        workoutDaysPerWeek: 4,
        workoutTimeframe: "flexible",
        createdAt: new Date().toISOString(),
      } satisfies UserProfile;
      await dbSaveProfile(account.userId, profile);
    } else if (!profile.email) {
      profile = { ...profile, email: account.email };
      await dbSaveProfile(account.userId, profile);
    }

    const res = NextResponse.json({
      authenticated: true,
      userId: account.userId,
      profile,
    });
    res.headers.append("Set-Cookie", buildSetCookieHeader(account.userId));
    return res;
  } catch (err) {
    console.error("auth/login", err);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
