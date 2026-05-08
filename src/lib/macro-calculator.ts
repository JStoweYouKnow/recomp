/**
 * Healthy Eater–style macro calculator.
 * Uses Mifflin-St Jeor for BMR, activity multiplier for TDEE,
 * goal-based deficit/surplus, and protein/carb splits by weight and goal.
 */

import type { Macros, Goal, MeasurementTargets } from "@/lib/types";

// Mifflin-St Jeor: BMR = 10*weight(kg) + 6.25*height(cm) - 5*age + s (s: +5 male, -161 female)
function mifflinStJeor(weightKg: number, heightCm: number, age: number, gender: "male" | "female"): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return base + (gender === "male" ? 5 : -161);
}

// Activity multipliers (sedentary → very_active)
const ACTIVITY_MULT: Record<string, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

// Protein g per lb body weight by goal (Healthy Eater style)
// lose_weight: moderate-high protein for satiety
// maintain: standard
// build_muscle: high for muscle synthesis
// improve_endurance: moderate, carbs prioritized
const PROTEIN_PER_LB: Record<Goal, number> = {
  lose_weight: 0.65,
  maintain: 0.55,
  build_muscle: 0.9,
  improve_endurance: 0.5,
};

// Fat % of total calories (Healthy Eater default ~30%)
const FAT_PCT: Record<Goal, number> = {
  lose_weight: 0.3,
  maintain: 0.28,
  build_muscle: 0.25,
  improve_endurance: 0.25,
};

// Calorie adjustment: deficit for lose, surplus for build, neutral for others
const CAL_ADJUST: Record<Goal, number> = {
  lose_weight: -500,
  maintain: 0,
  build_muscle: 250,
  improve_endurance: 100,
};

/** Max extra kcal shift (beyond base goal adjustment) attributable to measurement targets alone */
const MEASUREMENT_DELTA_CAP = 400;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Signed kcal/day to add on top of `tdee + CAL_ADJUST` from gaps vs body-composition targets.
 * Negative ⇒ extra deficit toward lower weight/BF targets; positive ⇒ surplus toward muscle/weight targets.
 */
export function measurementTargetCalorieDelta(input: {
  goal: Goal;
  /** Current body mass in lbs (from profile kg × 2.2046 or scale). */
  currentWeightLbs: number;
  measurementTargets?: Pick<MeasurementTargets, "targetWeightLbs" | "targetBodyFatPercent" | "targetMuscleMassLbs">;
  /** Latest reliable body-fat % when available */
  currentBodyFatPercent?: number;
  /** Latest muscle mass lbs when available */
  currentMuscleMassLbs?: number;
}): number {
  const { goal, currentWeightLbs, measurementTargets: targets } = input;
  if (!targets) return 0;

  let delta = 0;

  const tw = targets.targetWeightLbs;
  if (tw != null && Number.isFinite(tw) && tw >= 44 && tw <= 1100) {
    const gapLb = currentWeightLbs - tw;
    if (gapLb > 2) {
      const weeks = clamp(Math.round(gapLb * 2), 10, 40);
      const lbsPerWeek = clamp(gapLb / weeks, 0.35, 1.25);
      let deficit = Math.round(((lbsPerWeek * 3500) / 7) * (goal === "build_muscle" ? 0.45 : goal === "improve_endurance" ? 0.85 : 1));
      deficit = Math.min(goal === "build_muscle" ? 280 : goal === "lose_weight" ? 450 : 320, deficit);
      if (goal === "lose_weight" || goal === "maintain" || goal === "improve_endurance" || goal === "build_muscle") {
        delta -= deficit;
      }
    } else if (gapLb < -2 && (goal === "build_muscle" || goal === "maintain")) {
      const lbsPerWeek = clamp((-gapLb) / 24, 0.22, 0.95);
      const surplus = Math.min(300, Math.round((lbsPerWeek * 3500) / 7));
      delta += surplus;
    }
  }

  const tbf = targets.targetBodyFatPercent;
  const cbf = input.currentBodyFatPercent;
  if (
    tbf != null &&
    cbf != null &&
    Number.isFinite(tbf) &&
    Number.isFinite(cbf) &&
    cbf >= 3 &&
    cbf <= 60 &&
    tbf >= 3 &&
    tbf <= 55
  ) {
    const bfGap = cbf - tbf;
    if (bfGap > 1.5 && (goal === "lose_weight" || goal === "maintain" || goal === "improve_endurance" || goal === "build_muscle")) {
      delta -= Math.round(Math.min(140, bfGap * 14) * (goal === "build_muscle" ? 0.5 : 1));
    }
  }

  const tm = targets.targetMuscleMassLbs;
  const cm = input.currentMuscleMassLbs;
  if (tm != null && cm != null && Number.isFinite(tm) && Number.isFinite(cm) && tm > 1 && cm >= 0) {
    const mGapLb = tm - cm;
    if (mGapLb > 3 && goal === "build_muscle") {
      delta += Math.min(200, Math.round((clamp(mGapLb / 28, 0.08, 0.75) * 3500) / 7));
    }
    // Recomposition: soften cuts slightly when preserving/gaining lean mass matters
    if (mGapLb > 6 && goal === "lose_weight") {
      delta += Math.min(120, Math.round((clamp((mGapLb - 6) / 35, 0.05, 0.35) * 3500) / 7));
    }
  }

  return clamp(delta, -MEASUREMENT_DELTA_CAP, MEASUREMENT_DELTA_CAP);
}

/** Extra grams protein per lb body weight from muscle-mass gaps (capped). */
export function measurementTargetProteinBonusPerLb(
  goal: Goal,
  measurementTargets?: Pick<MeasurementTargets, "targetMuscleMassLbs">,
  currentMuscleMassLbs?: number,
): number {
  const tm = measurementTargets?.targetMuscleMassLbs;
  const cm = currentMuscleMassLbs;
  if (tm == null || cm == null || !Number.isFinite(tm) || !Number.isFinite(cm)) return 0;
  const mGapLb = tm - cm;
  if (mGapLb <= 2) return 0;
  if (goal === "build_muscle") return clamp(0.04 + mGapLb * 0.0045, 0, 0.28);
  if (goal === "lose_weight" && mGapLb > 8) return clamp(0.06 + (mGapLb - 8) * 0.008, 0, 0.18);
  return 0;
}

export interface MacroCalculatorInput {
  weightKg: number;
  heightCm: number;
  age: number;
  gender: "male" | "female" | "other";
  dailyActivityLevel: string;
  goal: Goal;
  /** When the adaptive metabolic model has learned the user's true TDEE, use it instead of Mifflin-St Jeor */
  learnedTDEE?: number;
  /** Stored body targets (lbs / %) — adjusts calories & protein toward those gaps */
  measurementTargets?: Pick<MeasurementTargets, "targetWeightLbs" | "targetBodyFatPercent" | "targetMuscleMassLbs">;
  /** From latest smart-scale / wearable row when known */
  currentBodyFatPercent?: number;
  currentMuscleMassLbs?: number;
}

export function calculateMacros(input: MacroCalculatorInput): Macros {
  const {
    weightKg,
    heightCm,
    age,
    gender,
    dailyActivityLevel,
    goal,
    learnedTDEE,
    measurementTargets,
    currentBodyFatPercent,
    currentMuscleMassLbs,
  } = input;
  const actKey = dailyActivityLevel in ACTIVITY_MULT ? dailyActivityLevel : "moderate";
  const mult = ACTIVITY_MULT[actKey] ?? 1.55;

  let tdee: number;
  if (learnedTDEE && learnedTDEE >= 1200 && learnedTDEE <= 5000) {
    tdee = learnedTDEE;
  } else {
    const bmr = mifflinStJeor(weightKg, heightCm, age, gender === "other" ? "male" : gender);
    tdee = bmr * mult;
  }
  const currentWeightLbs = weightKg * 2.2046226218;
  const goalCalAdjust = CAL_ADJUST[goal] ?? 0;
  const measurementCalDelta = measurementTargetCalorieDelta({
    goal,
    currentWeightLbs,
    measurementTargets,
    currentBodyFatPercent,
    currentMuscleMassLbs,
  });
  const targetCal = Math.round(tdee + goalCalAdjust + measurementCalDelta);
  const cal = Math.max(1200, Math.min(4000, targetCal));

  const weightLb = weightKg * 2.205;
  const proteinBump = measurementTargetProteinBonusPerLb(goal, measurementTargets, currentMuscleMassLbs);
  const proteinG = Math.round(weightLb * ((PROTEIN_PER_LB[goal] ?? 0.55) + proteinBump));
  const proteinCal = proteinG * 4;

  const fatPct = FAT_PCT[goal] ?? 0.28;
  const fatCal = cal * fatPct;
  const fatG = Math.round(fatCal / 9);

  const remainingCal = Math.max(0, cal - proteinCal - fatCal);
  const carbsG = Math.round(remainingCal / 4);

  return {
    calories: cal,
    protein: Math.max(50, proteinG),
    carbs: Math.max(0, carbsG),
    fat: Math.max(20, fatG),
  };
}
