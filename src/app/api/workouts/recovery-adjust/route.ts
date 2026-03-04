import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { invokeNova } from "@/lib/nova";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { logError } from "@/lib/logger";
import type { RecoveryAssessment } from "@/lib/types";

const SYSTEM = `You are a recovery assessment AI for fitness. Given wearable data (sleep, readiness, HRV, resting HR) and today's planned workout, assess recovery and suggest modifications if needed.

Return JSON: {
  "recommendation": "Brief recommendation text",
  "modifiedWorkout": {
    "volumeAdjustment": number (-30 to +10),
    "intensityAdjustment": number (-30 to +10),
    "suggestedSwaps": [{ "original": "exercise name", "replacement": "easier alternative", "reason": "why" }]
  }
}

Only include modifiedWorkout if recovery is low (<60). Be specific about exercise swaps.`;

export async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "recovery-adjust"), 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const userId = await getUserId(req.headers);
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    const { wearableData, todayWorkout } = await req.json();

    const sleep = wearableData?.sleepScore ?? 70;
    const readiness = wearableData?.readinessScore ?? 70;
    const restingHR = wearableData?.heartRateResting ?? 60;

    // Baseline resting HR assumed ~60bpm; higher = more fatigued
    const hrDelta = Math.max(0, Math.min(100, 100 - (restingHR - 50) * 2));
    const score = Math.round(sleep * 0.35 + readiness * 0.35 + hrDelta * 0.3);

    const level = score >= 80 ? "optimal" : score >= 65 ? "high" : score >= 50 ? "moderate" : "low";

    const factors = [
      { name: "Sleep Score", impact: sleep >= 70 ? "positive" as const : "negative" as const, value: `${sleep}/100` },
      { name: "Readiness", impact: readiness >= 70 ? "positive" as const : "negative" as const, value: `${readiness}/100` },
      { name: "Resting HR", impact: restingHR <= 65 ? "positive" as const : "negative" as const, value: `${restingHR} bpm` },
    ];

    let assessment: RecoveryAssessment = {
      score,
      level,
      factors,
      recommendation: score >= 65
        ? "You're well-recovered. Train as planned!"
        : "Recovery is low. Consider reducing intensity today.",
    };

    if (score < 60 && todayWorkout) {
      const prompt = `Recovery score: ${score}/100. Sleep: ${sleep}, Readiness: ${readiness}, Resting HR: ${restingHR}bpm.
Today's planned workout: ${JSON.stringify(todayWorkout)}
Suggest modifications.`;

      const raw = await invokeNova(SYSTEM, prompt, { temperature: 0.3, maxTokens: 512 });
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        assessment = { ...assessment, recommendation: parsed.recommendation ?? assessment.recommendation, modifiedWorkout: parsed.modifiedWorkout };
      }
    }

    return NextResponse.json(assessment);
  } catch (err) {
    logError("Recovery adjust failed", err, { route: "workouts/recovery-adjust" });
    return NextResponse.json({ error: "Recovery assessment failed" }, { status: 500 });
  }
}
