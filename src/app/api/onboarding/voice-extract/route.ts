import { NextRequest, NextResponse } from "next/server";
import { invokeNova } from "@/lib/nova";
import {
  fixedWindowRateLimit,
  getClientKey,
  getRequestIp,
} from "@/lib/server-rate-limit";

const SYSTEM = `You are an onboarding assistant for a fitness app. Parse the user's spoken self-description into structured profile data.
Respond with valid JSON only, no markdown. Use null for missing fields.
{
  "name": string | null,
  "age": number | null,
  "weightLbs": number | null,
  "heightFt": number | null,
  "heightIn": number | null,
  "gender": "male" | "female" | "other" | null,
  "fitnessLevel": "beginner" | "intermediate" | "advanced" | "athlete" | null,
  "goal": "lose_weight" | "maintain" | "build_muscle" | "improve_endurance" | null,
  "dailyActivityLevel": "sedentary" | "light" | "moderate" | "active" | "very_active" | null,
  "workoutLocation": "home" | "gym" | "outside" | null,
  "restrictions": string | null
}
Use reasonable defaults if unclear (age 30, weight 154 lbs, 5'7", gym, moderate, build muscle).`;

export async function POST(req: NextRequest) {
  const rl = fixedWindowRateLimit(
    getClientKey(getRequestIp(req), "onboarding-voice"),
    10,
    60_000
  );
  if (!rl.ok)
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429 }
    );

  try {
    const { transcript } = await req.json();
    if (!transcript || typeof transcript !== "string") {
      return NextResponse.json(
        { error: "Transcript required" },
        { status: 400 }
      );
    }

    const raw = await invokeNova(
      SYSTEM,
      `Parse this onboarding description: "${transcript}"`,
      { temperature: 0.2, maxTokens: 384 }
    );
    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : null;
    return NextResponse.json(parsed ?? {});
  } catch (err) {
    console.error("Onboarding voice extract error:", err);
    return NextResponse.json(
      { error: "Could not parse. Try the form instead." },
      { status: 500 }
    );
  }
}
