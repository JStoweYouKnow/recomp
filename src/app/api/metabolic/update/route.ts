import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { logError } from "@/lib/logger";
import { rateLimitError, unauthorized, internalError } from "@/lib/api-response";
import type { MetabolicModel, MetabolicDataPoint } from "@/lib/types";

// Fit a least-squares regression line through (x, y) pairs.
// Returns slope (dy/dx) and intercept.
function linearRegression(points: { x: number; y: number }[]): { slope: number; intercept: number; r2: number } {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: points[0]?.y ?? 0, r2: 0 };

  const meanX = points.reduce((s, p) => s + p.x, 0) / n;
  const meanY = points.reduce((s, p) => s + p.y, 0) / n;

  let ssXY = 0, ssXX = 0, ssYY = 0;
  for (const p of points) {
    ssXY += (p.x - meanX) * (p.y - meanY);
    ssXX += (p.x - meanX) ** 2;
    ssYY += (p.y - meanY) ** 2;
  }

  const slope = ssXX === 0 ? 0 : ssXY / ssXX;
  const intercept = meanY - slope * meanX;
  const r2 = ssYY === 0 ? 1 : Math.min(1, (ssXY ** 2) / (ssXX * ssYY));
  return { slope, intercept, r2 };
}

export async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "metabolic-update"), 5, 60_000);
  if (!rl.ok) return rateLimitError("Rate limit exceeded");

  const userId = await getUserId(req.headers);
  if (!userId) return unauthorized();

  try {
    const { dataPoints, currentTDEE, history: incomingHistory } = await req.json() as {
      dataPoints: MetabolicDataPoint[];
      currentTDEE: number;
      history?: MetabolicModel["history"];
    };

    if (!dataPoints || dataPoints.length < 7) {
      return NextResponse.json({
        estimatedTDEE: currentTDEE,
        confidence: 0,
        dataPoints: dataPoints ?? [],
        lastUpdated: new Date().toISOString(),
        history: incomingHistory ?? [],
        message: "Need at least 7 days of data to build metabolic model",
      });
    }

    const sorted = [...dataPoints].sort((a, b) => a.date.localeCompare(b.date));
    const days = sorted.length;

    // --- Weight trend via linear regression (robust against noisy single weigh-ins) ---
    const weightPoints = sorted.map((d, i) => ({ x: i, y: d.weightKg }));
    const { slope: weightSlopePerDay, r2: weightR2 } = linearRegression(weightPoints);
    // kg/day trend → daily energy imbalance
    const dailyImbalanceFromTrend = weightSlopePerDay * 7700;

    // --- Recency-weighted average intake (half-life ≈ 30 days) ---
    const halfLifeDays = 30;
    const lambda = Math.LN2 / halfLifeDays;
    let weightedIntakeSum = 0;
    let weightSum = 0;
    for (let i = 0; i < days; i++) {
      const daysFromEnd = days - 1 - i;
      const w = Math.exp(-lambda * daysFromEnd);
      weightedIntakeSum += sorted[i].totalIntake * w;
      weightSum += w;
    }
    const weightedAvgIntake = weightedIntakeSum / weightSum;

    // TDEE = weighted avg intake − daily energy imbalance from weight trend
    const estimatedTDEE = Math.round(weightedAvgIntake - dailyImbalanceFromTrend);

    // --- Confidence: quantity + quality signals, no hard cap at 30 days ---
    // (a) Data quantity: grows logarithmically so 50 days > 30 days > 14 days
    const quantityScore = Math.min(50, Math.round(Math.log(days / 7 + 1) / Math.log(50 / 7 + 1) * 50));

    // (b) Weight trend quality: high R² means weight data follows a clean line
    const trendQuality = Math.round(weightR2 * 25);

    // (c) Estimate stability: if recent history shows TDEE within ±75 kcal, that is strong evidence
    const recentHistory = (incomingHistory ?? []).slice(-10);
    let stabilityScore = 0;
    if (recentHistory.length >= 3) {
      const recentTDEEs = recentHistory.map((h) => h.tdee);
      const histMean = recentTDEEs.reduce((s, v) => s + v, 0) / recentTDEEs.length;
      const maxDeviation = Math.max(...recentTDEEs.map((v) => Math.abs(v - histMean)));
      if (maxDeviation <= 75) stabilityScore = 25;
      else if (maxDeviation <= 150) stabilityScore = 12;
    }

    let confidence = Math.min(100, quantityScore + trendQuality + stabilityScore);

    // Clamp TDEE to physiologically reasonable range
    const clampedTDEE = Math.max(1200, Math.min(5000, estimatedTDEE));
    if (clampedTDEE !== estimatedTDEE) confidence = Math.max(0, confidence - 20);

    // Accumulate history (keep last 90 entries)
    const newHistoryEntry = { date: new Date().toISOString(), tdee: clampedTDEE, confidence };
    const history = [...(incomingHistory ?? []), newHistoryEntry].slice(-90);

    const model: MetabolicModel = {
      estimatedTDEE: clampedTDEE,
      confidence,
      dataPoints: sorted,
      lastUpdated: new Date().toISOString(),
      history,
    };

    return NextResponse.json(model);
  } catch (err) {
    logError("Metabolic model update failed", err, { route: "metabolic/update" });
    return internalError("Failed to update metabolic model", err);
  }
}
