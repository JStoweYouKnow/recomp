import { NextRequest, NextResponse } from "next/server";
import { buildSetCookieHeader, getUserId } from "@/lib/auth";
import { hashPassword } from "@/lib/auth-password";
import {
  dbCreateAccount,
  dbGetProfile,
  dbSaveAuthAccount,
  dbSaveProfile,
  dbVerifyAccount,
} from "@/lib/db";
import { isJudgeMode } from "@/lib/judgeMode";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import type { UserProfile } from "@/lib/types";

export async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "auth-claim"), 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  if (isJudgeMode()) {
    await req.json().catch(() => ({}));
    return NextResponse.json({ error: "Claim disabled in judge mode" }, { status: 503 });
  }

  if (!process.env.DYNAMODB_TABLE_NAME) {
    return NextResponse.json({ error: "Claim unavailable" }, { status: 503 });
  }

  try {
    const userId = await getUserId(req.headers);
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = (await req.json()) as { email?: string; password?: string };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || password.length < 8) {
      return NextResponse.json({ error: "Valid email and password (min 8) required" }, { status: 400 });
    }

    const existing = await dbVerifyAccount(email);
    if (existing && existing.userId !== userId) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const now = new Date().toISOString();

    if (existing && existing.userId === userId) {
      await dbSaveAuthAccount({ ...existing, passwordHash });
    } else {
      const created = await dbCreateAccount({
        userId,
        email,
        passwordHash,
        createdAt: now,
      });
      if (!created) {
        return NextResponse.json({ error: "Email already registered" }, { status: 409 });
      }
    }

    let profile = await dbGetProfile(userId);
    if (!profile) {
      profile = {
        id: userId,
        name: "Athlete",
        email,
        age: 30,
        weight: 70,
        height: 170,
        gender: "other",
        fitnessLevel: "beginner",
        goal: "maintain",
        dietaryRestrictions: [],
        injuriesOrLimitations: [],
        dailyActivityLevel: "moderate",
        unitSystem: "us",
        workoutLocation: "gym",
        workoutEquipment: ["free_weights", "machines"],
        workoutDaysPerWeek: 4,
        workoutTimeframe: "flexible",
        createdAt: now,
      } satisfies UserProfile;
    } else {
      profile = { ...profile, email };
    }
    await dbSaveProfile(userId, profile);

    const res = NextResponse.json({ ok: true, userId, email });
    res.headers.append("Set-Cookie", buildSetCookieHeader(userId));
    return res;
  } catch (err) {
    console.error("auth/claim", err);
    return NextResponse.json({ error: "Claim failed" }, { status: 500 });
  }
}
