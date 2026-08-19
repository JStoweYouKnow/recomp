/**
 * Diet phase state machine.
 *
 * The app already estimates TDEE well (`/api/metabolic/update` regresses weight trend against
 * intake). Nothing consumed it. This module closes that loop: it reads the trend, judges
 * whether the rate of change is actually productive, and moves the lifter between phases —
 * cut, maintenance, diet break, lean bulk — instead of letting them sit in a permanent
 * deficit until adherence collapses.
 *
 * The core judgement is rate, not direction. Losing 3 lb a week is not "working better"
 * than losing 1; it is losing lean mass and borrowing against the next twelve weeks.
 *
 * Mirrored on iOS (`DietPhase.swift`) and Android (`api/DietPhase.kt`).
 */

import type { Goal, WearableDaySummary } from "./types";

// ── Tunables ────────────────────────────────────────────

/** Smoothing factor for the exponentially weighted trend weight (~10-day half life). */
const TREND_ALPHA = 0.1;
/** Minimum weigh-ins before a trend is trustworthy. */
const MIN_WEIGH_INS = 4;

/** Productive weekly loss, as a fraction of body weight. */
const LOSS_TARGET_MIN = 0.005; // 0.5%
const LOSS_TARGET_MAX = 0.01; // 1.0%
/** Past this, lean mass is going with the fat. */
const LOSS_AGGRESSIVE = 0.015; // 1.5%

/** Productive weekly gain on a lean bulk, as a fraction of body weight. */
const GAIN_TARGET_MIN = 0.0025; // 0.25%
const GAIN_TARGET_MAX = 0.005; // 0.5%

/** Consecutive weeks in a deficit before a diet break is due. */
const DIET_BREAK_AFTER_WEEKS = 12;
/** A stall this long in an active phase means the plan needs changing. */
const STALL_WEEKS = 3;

/** kcal per pound of body mass. */
const KCAL_PER_LB = 3500;

// ── Types ───────────────────────────────────────────────

export type DietPhaseName = "cut" | "maintenance" | "diet_break" | "lean_bulk" | "recomp";

export type RateVerdict = "too_fast" | "on_track" | "too_slow" | "stalled" | "wrong_direction";

export interface WeightTrend {
  /** Exponentially weighted trend weight in lbs — the number to coach off, not the last weigh-in. */
  trendWeightLbs: number;
  /** Most recent raw weigh-in, for comparison. */
  latestWeightLbs: number;
  /** Weekly change in the trend, lbs (negative = losing). */
  weeklyChangeLbs: number;
  /** Weekly change as a fraction of body weight. */
  weeklyChangePct: number;
  weighInCount: number;
  /** Days spanned by the weigh-ins used. */
  spanDays: number;
  /** False when there is not enough data to judge anything. */
  reliable: boolean;
}

export interface LeanMassSignal {
  /** Change in fat-free mass over the window, lbs. */
  leanChangeLbs: number;
  /** Fraction of total weight lost that came from lean mass. */
  leanShareOfLoss: number;
  /** True when lean mass is falling fast enough to warrant slowing down. */
  losingLeanMass: boolean;
}

export interface DietPhaseAssessment {
  phase: DietPhaseName;
  rateVerdict: RateVerdict;
  trend: WeightTrend;
  leanMass?: LeanMassSignal;
  /** Suggested daily calorie change from current intake. 0 when nothing should move. */
  calorieAdjustment: number;
  /** Weeks spent in the current direction. */
  weeksInPhase: number;
  /** Whether a diet break is now indicated. */
  dietBreakDue: boolean;
  /** Primary message for the user. */
  headline: string;
  /** Supporting detail, most important first. */
  details: string[];
  /** Suggested next phase, when a transition is warranted. */
  suggestedPhase?: DietPhaseName;
}

export interface DietPhaseInput {
  goal: Goal;
  /** Weigh-ins, any order. Weight in lbs. */
  weighIns: Pick<WearableDaySummary, "date" | "weight" | "bodyFatPercent">[];
  /** Current daily calorie target. */
  currentCalories: number;
  /** Estimated TDEE from the metabolic model, when confidence is adequate. */
  estimatedTDEE?: number;
  /** Confidence 0-100 from the metabolic model. */
  tdeeConfidence?: number;
  /** Consecutive weeks already spent in a deficit. */
  weeksInDeficit?: number;
  today?: string;
}

// ── Trend weight ────────────────────────────────────────

/**
 * Exponentially weighted trend weight and its weekly rate of change.
 *
 * Daily scale weight swings several pounds on water and glycogen alone. Coaching off the
 * last weigh-in produces whiplash; coaching off the trend produces decisions.
 */
export function computeWeightTrend(
  weighIns: Pick<WearableDaySummary, "date" | "weight">[],
): WeightTrend {
  const points = weighIns
    .filter((w): w is { date: string; weight: number } => typeof w.weight === "number" && w.weight > 0)
    .map((w) => ({ date: w.date, weight: w.weight }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (points.length === 0) {
    return {
      trendWeightLbs: 0,
      latestWeightLbs: 0,
      weeklyChangeLbs: 0,
      weeklyChangePct: 0,
      weighInCount: 0,
      spanDays: 0,
      reliable: false,
    };
  }

  // EWMA gives the displayed trend weight — smooth, and what the user should read off the scale.
  let trend = points[0].weight;
  for (let i = 1; i < points.length; i++) {
    trend = TREND_ALPHA * points[i].weight + (1 - TREND_ALPHA) * trend;
  }

  const dayOf = (date: string) => new Date(date + "T12:00:00").getTime() / 86_400_000;
  const day0 = dayOf(points[0].date);
  const spanDays = Math.max(0, Math.round(dayOf(points[points.length - 1].date) - day0));

  /*
   * Rate comes from least-squares regression on the raw weigh-ins, not from the EWMA.
   * An EWMA lags a trending series, so measuring endpoint-to-endpoint across it would
   * systematically understate how fast weight is actually moving — which would have the
   * engine calling an aggressive 2%/week cut "on track". Regression is unbiased, and it
   * matches how /api/metabolic/update already derives its weight trend.
   */
  let weeklyChangeLbs = 0;
  if (spanDays >= 7 && points.length >= 2) {
    const xs = points.map((p) => dayOf(p.date) - day0);
    const ys = points.map((p) => p.weight);
    const n = xs.length;
    const meanX = xs.reduce((s, x) => s + x, 0) / n;
    const meanY = ys.reduce((s, y) => s + y, 0) / n;
    let ssXY = 0;
    let ssXX = 0;
    for (let i = 0; i < n; i++) {
      ssXY += (xs[i] - meanX) * (ys[i] - meanY);
      ssXX += (xs[i] - meanX) ** 2;
    }
    weeklyChangeLbs = ssXX === 0 ? 0 : (ssXY / ssXX) * 7;
  }

  const weeklyChangePct = trend > 0 ? weeklyChangeLbs / trend : 0;

  return {
    trendWeightLbs: Math.round(trend * 10) / 10,
    latestWeightLbs: points[points.length - 1].weight,
    weeklyChangeLbs: Math.round(weeklyChangeLbs * 100) / 100,
    weeklyChangePct: Math.round(weeklyChangePct * 10000) / 10000,
    weighInCount: points.length,
    spanDays,
    reliable: points.length >= MIN_WEIGH_INS && spanDays >= 10,
  };
}

/**
 * Whether weight lost is coming from fat or from muscle.
 *
 * A cut that strips lean mass is not a successful cut — it is the reason people end a diet
 * smaller, weaker, and with a lower TDEE than they started.
 */
export function computeLeanMassSignal(
  weighIns: Pick<WearableDaySummary, "date" | "weight" | "bodyFatPercent">[],
): LeanMassSignal | undefined {
  const points = weighIns
    .filter(
      (w): w is { date: string; weight: number; bodyFatPercent: number } =>
        typeof w.weight === "number" &&
        w.weight > 0 &&
        typeof w.bodyFatPercent === "number" &&
        w.bodyFatPercent > 0,
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  if (points.length < 2) return undefined;

  const first = points[0];
  const last = points[points.length - 1];
  const leanFirst = first.weight * (1 - first.bodyFatPercent / 100);
  const leanLast = last.weight * (1 - last.bodyFatPercent / 100);
  const leanChangeLbs = Math.round((leanLast - leanFirst) * 100) / 100;

  const totalChange = last.weight - first.weight;
  // Only meaningful while losing; a gain phase is judged on other terms.
  const leanShareOfLoss =
    totalChange < 0 ? Math.round((Math.abs(leanChangeLbs) / Math.abs(totalChange)) * 100) / 100 : 0;

  return {
    leanChangeLbs,
    leanShareOfLoss,
    // More than a quarter of loss coming from lean tissue is the warning line.
    losingLeanMass: totalChange < 0 && leanChangeLbs < 0 && leanShareOfLoss > 0.25,
  };
}

// ── Rate judgement ──────────────────────────────────────

function verdictForCut(pct: number): RateVerdict {
  const loss = -pct; // positive when losing
  if (loss >= LOSS_AGGRESSIVE) return "too_fast";
  if (loss >= LOSS_TARGET_MIN) return "on_track";
  if (loss > 0) return "too_slow";
  if (pct === 0) return "stalled";
  return "wrong_direction";
}

function verdictForBulk(pct: number): RateVerdict {
  if (pct > GAIN_TARGET_MAX) return "too_fast";
  if (pct >= GAIN_TARGET_MIN) return "on_track";
  if (pct > 0) return "too_slow";
  if (pct === 0) return "stalled";
  return "wrong_direction";
}

/** Maintenance and recomp want the trend flat; drift in either direction is the signal. */
function verdictForFlat(pct: number): RateVerdict {
  if (Math.abs(pct) <= 0.0025) return "on_track";
  return pct > 0 ? "too_fast" : "wrong_direction";
}

function phaseForGoal(goal: Goal): DietPhaseName {
  switch (goal) {
    case "lose_weight":
      return "cut";
    case "build_muscle":
      return "lean_bulk";
    case "maintain":
      return "maintenance";
    case "improve_endurance":
      return "maintenance";
  }
}

// ── Assessment ──────────────────────────────────────────

/**
 * Read the trend and decide what should change.
 *
 * Deliberately conservative: with thin data it says so and adjusts nothing, because a
 * calorie change made on noise costs more trust than a week of waiting.
 */
export function assessDietPhase(input: DietPhaseInput): DietPhaseAssessment {
  const trend = computeWeightTrend(input.weighIns);
  const leanMass = computeLeanMassSignal(input.weighIns);
  const phase = phaseForGoal(input.goal);
  const weeksInPhase = Math.floor(trend.spanDays / 7);
  const weeksInDeficit = input.weeksInDeficit ?? (phase === "cut" ? weeksInPhase : 0);
  const dietBreakDue = phase === "cut" && weeksInDeficit >= DIET_BREAK_AFTER_WEEKS;

  if (!trend.reliable) {
    return {
      phase,
      rateVerdict: "stalled",
      trend,
      leanMass,
      calorieAdjustment: 0,
      weeksInPhase,
      dietBreakDue: false,
      headline: "Not enough weigh-ins yet to judge your rate.",
      details: [
        `Log at least ${MIN_WEIGH_INS} weigh-ins across 10+ days and this turns into real guidance.`,
      ],
    };
  }

  const pct = trend.weeklyChangePct;
  const rateVerdict =
    phase === "cut" ? verdictForCut(pct) : phase === "lean_bulk" ? verdictForBulk(pct) : verdictForFlat(pct);

  const details: string[] = [];
  let calorieAdjustment = 0;
  let headline: string;
  let suggestedPhase: DietPhaseName | undefined;

  const weeklyAbs = Math.abs(trend.weeklyChangeLbs);
  const pctLabel = `${(Math.abs(pct) * 100).toFixed(2)}%`;

  if (dietBreakDue) {
    suggestedPhase = "diet_break";
    calorieAdjustment = Math.max(0, Math.round((input.estimatedTDEE ?? input.currentCalories) - input.currentCalories));
    headline = `${weeksInDeficit} weeks in a deficit — time for a diet break.`;
    details.push(
      "Eat at maintenance for 1–2 weeks. This restores hormones and adherence, and makes the next block of fat loss work.",
    );
    if (calorieAdjustment > 0) {
      details.push(`That means about +${calorieAdjustment} kcal/day back to maintenance.`);
    }
  } else if (phase === "cut") {
    switch (rateVerdict) {
      case "too_fast":
        // Slow to the top of the productive band rather than to its middle.
        calorieAdjustment = Math.round(
          ((weeklyAbs - trend.trendWeightLbs * LOSS_TARGET_MAX) * KCAL_PER_LB) / 7,
        );
        headline = `Losing ${weeklyAbs.toFixed(1)} lb/week (${pctLabel}) — faster than is productive.`;
        details.push("Above ~1% of body weight per week, a growing share of the loss is muscle.");
        details.push(`Add about ${calorieAdjustment} kcal/day to bring this into the productive range.`);
        break;
      case "on_track":
        headline = `Losing ${weeklyAbs.toFixed(1)} lb/week (${pctLabel}) — right in the productive range.`;
        details.push("Hold everything. This is the rate that keeps muscle while fat comes off.");
        break;
      case "too_slow":
        calorieAdjustment = -Math.round(
          ((trend.trendWeightLbs * LOSS_TARGET_MIN - weeklyAbs) * KCAL_PER_LB) / 7,
        );
        headline = `Losing ${weeklyAbs.toFixed(1)} lb/week — slower than target.`;
        details.push(`Trim about ${Math.abs(calorieAdjustment)} kcal/day, or add steps before cutting food.`);
        break;
      case "stalled":
      case "wrong_direction":
        calorieAdjustment = -200;
        headline =
          rateVerdict === "stalled"
            ? "Weight trend is flat — the deficit has closed."
            : `Trend is up ${weeklyAbs.toFixed(1)} lb/week while cutting.`;
        details.push(
          "Either intake has drifted up or your TDEE has adapted. Tighten logging for a week before cutting further.",
        );
        if (weeksInPhase >= STALL_WEEKS) {
          details.push(`It has been ${weeksInPhase} weeks — worth a diet break before pushing harder.`);
          suggestedPhase = "diet_break";
        }
        break;
    }
  } else if (phase === "lean_bulk") {
    switch (rateVerdict) {
      case "too_fast":
        calorieAdjustment = -Math.round(
          ((trend.weeklyChangeLbs - trend.trendWeightLbs * GAIN_TARGET_MAX) * KCAL_PER_LB) / 7,
        );
        headline = `Gaining ${weeklyAbs.toFixed(1)} lb/week (${pctLabel}) — faster than you can build.`;
        details.push("Past ~0.5% per week the surplus mostly becomes fat. Pull back to keep the bulk lean.");
        break;
      case "on_track":
        headline = `Gaining ${weeklyAbs.toFixed(1)} lb/week — a lean-bulk pace.`;
        details.push("Hold here and keep the progressive overload coming.");
        break;
      case "too_slow":
      case "stalled":
        calorieAdjustment = 200;
        headline =
          rateVerdict === "stalled"
            ? "Weight trend is flat — you are eating at maintenance, not a surplus."
            : `Gaining ${weeklyAbs.toFixed(1)} lb/week — under the target pace.`;
        details.push("Add about 200 kcal/day and re-check in two weeks.");
        break;
      case "wrong_direction":
        calorieAdjustment = 300;
        headline = `Losing ${weeklyAbs.toFixed(1)} lb/week while trying to build.`;
        details.push("You are in a deficit. Add roughly 300 kcal/day.");
        break;
    }
  } else {
    switch (rateVerdict) {
      case "on_track":
        headline = "Weight is holding steady — maintenance is working.";
        details.push("With training progressing, this is where a recomp happens.");
        break;
      case "too_fast":
        calorieAdjustment = -150;
        headline = `Trending up ${weeklyAbs.toFixed(1)} lb/week during maintenance.`;
        details.push("Trim about 150 kcal/day to flatten it out.");
        break;
      default:
        calorieAdjustment = 150;
        headline = `Trending down ${weeklyAbs.toFixed(1)} lb/week during maintenance.`;
        details.push("Add about 150 kcal/day to hold your weight.");
        break;
    }
  }

  // Lean-mass loss overrides an otherwise acceptable rate.
  if (leanMass?.losingLeanMass && phase === "cut") {
    const share = Math.round(leanMass.leanShareOfLoss * 100);
    details.unshift(
      `${share}% of what you have lost is lean mass. Slow the deficit and keep protein and hard sets high.`,
    );
    if (calorieAdjustment <= 0) {
      calorieAdjustment = Math.round((trend.trendWeightLbs * LOSS_TARGET_MIN * KCAL_PER_LB) / 7 / 2);
    }
  }

  // A drifting TDEE estimate is worth surfacing once it is trustworthy.
  if (
    input.estimatedTDEE != null &&
    (input.tdeeConfidence ?? 0) >= 50 &&
    Math.abs(input.estimatedTDEE - input.currentCalories) >= 200
  ) {
    details.push(
      `Your measured TDEE is about ${input.estimatedTDEE} kcal against a ${input.currentCalories} kcal target.`,
    );
  }

  return {
    phase,
    rateVerdict,
    trend,
    leanMass,
    calorieAdjustment,
    weeksInPhase,
    dietBreakDue,
    headline,
    details,
    suggestedPhase,
  };
}

/** Display label for a phase. */
export function dietPhaseLabel(phase: DietPhaseName): string {
  switch (phase) {
    case "cut":
      return "Cut";
    case "maintenance":
      return "Maintenance";
    case "diet_break":
      return "Diet break";
    case "lean_bulk":
      return "Lean bulk";
    case "recomp":
      return "Recomp";
  }
}
