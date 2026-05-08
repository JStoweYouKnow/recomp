import { describe, it, expect } from "vitest";
import { calculateMacros, measurementTargetCalorieDelta, measurementTargetProteinBonusPerLb } from "./macro-calculator";

describe("measurementTargetCalorieDelta", () => {
  it("adds deficit when weight is above target", () => {
    const delta = measurementTargetCalorieDelta({
      goal: "maintain",
      currentWeightLbs: 220,
      measurementTargets: { targetWeightLbs: 190 },
    });
    expect(delta).toBeLessThan(0);
  });

  it("caps total target-driven kcal shift at ±400", () => {
    const delta = measurementTargetCalorieDelta({
      goal: "lose_weight",
      currentWeightLbs: 400,
      measurementTargets: { targetWeightLbs: 150 },
    });
    expect(delta).toBe(-400);
  });
});

describe("calculateMacros with measurement targets", () => {
  it("raises protein when muscle target exceeds current muscle", () => {
    const base = calculateMacros({
      weightKg: 90,
      heightCm: 180,
      age: 35,
      gender: "male",
      dailyActivityLevel: "moderate",
      goal: "build_muscle",
    });
    const withMuscleGoal = calculateMacros({
      weightKg: 90,
      heightCm: 180,
      age: 35,
      gender: "male",
      dailyActivityLevel: "moderate",
      goal: "build_muscle",
      measurementTargets: { targetMuscleMassLbs: 200 },
      currentMuscleMassLbs: 150,
    });
    expect(measurementTargetProteinBonusPerLb("build_muscle", { targetMuscleMassLbs: 200 }, 150)).toBeGreaterThan(
      0,
    );
    expect(withMuscleGoal.protein).toBeGreaterThanOrEqual(base.protein);
  });
});
