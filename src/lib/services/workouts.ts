/**
 * Workouts domain service.
 * Recovery assessment. No HTTP concerns.
 */

import { invokeNova } from "@/lib/nova";
import type { RecoveryAssessment } from "@/lib/types";

const RECOVERY_SYSTEM = `You are a recovery assessment AI for fitness. Given wearable data (sleep, readiness, HRV, resting HR) and today's planned workout, assess recovery and suggest modifications if needed.

Return JSON: {
  "recommendation": "Brief recommendation text",
  "modifiedWorkout": {
    "volumeAdjustment": number (-30 to +10),
    "intensityAdjustment": number (-30 to +10),
    "suggestedSwaps": [{ "original": "exercise name", "replacement": "easier alternative", "reason": "why" }]
  }
}

Only include modifiedWorkout if recovery is low (<60). Be specific about exercise swaps.`;

export interface RecoveryInput {
  wearableData?: {
    sleepScore?: number;
    readinessScore?: number;
    heartRateResting?: number;
  };
  todayWorkout?: unknown;
}

export async function assessRecovery(input: RecoveryInput): Promise<RecoveryAssessment> {
  const { wearableData, todayWorkout } = input;
  const sleep = wearableData?.sleepScore ?? 70;
  const readiness = wearableData?.readinessScore ?? 70;
  const restingHR = wearableData?.heartRateResting ?? 60;

  const hrDelta = Math.max(0, Math.min(100, 100 - (restingHR - 50) * 2));
  const score = Math.round(sleep * 0.35 + readiness * 0.35 + hrDelta * 0.3);
  const level = score >= 80 ? "optimal" : score >= 65 ? "high" : score >= 50 ? "moderate" : "low";

  const factors = [
    { name: "Sleep Score", impact: sleep >= 70 ? ("positive" as const) : ("negative" as const), value: `${sleep}/100` },
    { name: "Readiness", impact: readiness >= 70 ? ("positive" as const) : ("negative" as const), value: `${readiness}/100` },
    { name: "Resting HR", impact: restingHR <= 65 ? ("positive" as const) : ("negative" as const), value: `${restingHR} bpm` },
  ];

  let assessment: RecoveryAssessment = {
    score,
    level,
    factors,
    recommendation: score >= 65 ? "You're well-recovered. Train as planned!" : "Recovery is low. Consider reducing intensity today.",
  };

  if (score < 60 && todayWorkout) {
    const prompt = `Recovery score: ${score}/100. Sleep: ${sleep}, Readiness: ${readiness}, Resting HR: ${restingHR}bpm.
Today's planned workout: ${JSON.stringify(todayWorkout)}
Suggest modifications.`;

    const raw = await invokeNova(RECOVERY_SYSTEM, prompt, { temperature: 0.3, maxTokens: 512 });
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]) as Partial<RecoveryAssessment>;
        assessment = {
          ...assessment,
          recommendation: parsed.recommendation ?? assessment.recommendation,
          modifiedWorkout: parsed.modifiedWorkout,
        };
      } catch {
        // Keep default assessment
      }
    }
  }

  return assessment;
}
