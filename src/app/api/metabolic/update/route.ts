import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { logError } from "@/lib/logger";
import type { MetabolicModel, MetabolicDataPoint } from "@/lib/types";

export async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "metabolic-update"), 5, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const userId = await getUserId(req.headers);
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    const { dataPoints, currentTDEE } = await req.json() as {
      dataPoints: MetabolicDataPoint[];
      currentTDEE: number;
    };

    if (!dataPoints || dataPoints.length < 7) {
      return NextResponse.json({
        estimatedTDEE: currentTDEE,
        confidence: 0,
        dataPoints: dataPoints ?? [],
        lastUpdated: new Date().toISOString(),
        history: [],
        message: "Need at least 7 days of data to build metabolic model",
      });
    }

    // Sort by date
    const sorted = [...dataPoints].sort((a, b) => a.date.localeCompare(b.date));

    // Calculate weight change (kg)
    const firstWeight = sorted[0].weightKg;
    const lastWeight = sorted[sorted.length - 1].weightKg;
    const weightChangeKg = lastWeight - firstWeight;
    const days = sorted.length;

    // 1 kg of body weight ≈ 7700 kcal
    const totalCalorieImbalance = weightChangeKg * 7700;
    const dailyImbalance = totalCalorieImbalance / days;

    // Average daily intake
    const avgIntake = sorted.reduce((sum, d) => sum + d.totalIntake, 0) / days;

    // True TDEE = avg intake - daily imbalance (negative imbalance = deficit = higher TDEE)
    const estimatedTDEE = Math.round(avgIntake - dailyImbalance);

    // Confidence: more data points and more weight variation = higher confidence
    const weightVariation = Math.abs(weightChangeKg);
    let confidence = Math.min(100, Math.round(
      (Math.min(days, 30) / 30) * 70 + // up to 70% from data quantity
      Math.min(weightVariation * 10, 30)  // up to 30% from meaningful weight change
    ));

    // Clamp TDEE to reasonable range
    const clampedTDEE = Math.max(1200, Math.min(5000, estimatedTDEE));
    if (clampedTDEE !== estimatedTDEE) confidence = Math.max(0, confidence - 20);

    const model: MetabolicModel = {
      estimatedTDEE: clampedTDEE,
      confidence,
      dataPoints: sorted,
      lastUpdated: new Date().toISOString(),
      history: [{ date: new Date().toISOString(), tdee: clampedTDEE, confidence }],
    };

    return NextResponse.json(model);
  } catch (err) {
    logError("Metabolic model update failed", err, { route: "metabolic/update" });
    return NextResponse.json({ error: "Failed to update metabolic model" }, { status: 500 });
  }
}
