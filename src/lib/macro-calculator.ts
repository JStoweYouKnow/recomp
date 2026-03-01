/**
 * Healthy Eater–style macro calculator.
 * Uses Mifflin-St Jeor for BMR, activity multiplier for TDEE,
 * goal-based deficit/surplus, and protein/carb splits by weight and goal.
 */

import type { Macros, Goal } from "@/lib/types";

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

export interface MacroCalculatorInput {
  weightKg: number;
  heightCm: number;
  age: number;
  gender: "male" | "female" | "other";
  dailyActivityLevel: string;
  goal: Goal;
}

export function calculateMacros(input: MacroCalculatorInput): Macros {
  const { weightKg, heightCm, age, gender, dailyActivityLevel, goal } = input;
  const actKey = dailyActivityLevel in ACTIVITY_MULT ? dailyActivityLevel : "moderate";
  const mult = ACTIVITY_MULT[actKey] ?? 1.55;

  const bmr = mifflinStJeor(weightKg, heightCm, age, gender === "other" ? "male" : gender);
  const tdee = bmr * mult;
  const targetCal = Math.round(tdee + (CAL_ADJUST[goal] ?? 0));
  const cal = Math.max(1200, Math.min(4000, targetCal));

  const weightLb = weightKg * 2.205;
  const proteinG = Math.round(weightLb * (PROTEIN_PER_LB[goal] ?? 0.55));
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
