import { describe, expect, it } from "vitest";
import type { UserProfile } from "@/lib/types";
import {
  bmiFromWeightLbsHeightIn,
  normalizeOneWearableRow,
  profileHeightInches,
  repairWearableScaleRowsForCanonicalLbs,
} from "@/lib/wearable-normalize";

describe("profileHeightInches", () => {
  it("converts metric cm to inches", () => {
    const p = { unitSystem: "metric" as const, height: 177.8 };
    expect(profileHeightInches(p as UserProfile)).toBeCloseTo(70, 3);
  });

  it("uses inches when us and height looks like inches", () => {
    const p = {
      unitSystem: "us" as const,
      height: 70,
    } as UserProfile;
    expect(profileHeightInches(p)).toBe(70);
  });

  it("treats very large us heights as cm", () => {
    const p = { unitSystem: "us" as const, height: 175 } as UserProfile;
    expect(profileHeightInches(p)).toBeCloseTo(68.8976, 2);
  });
});

describe("normalizeOneWearableRow", () => {
  it("defaults missing units to lbs", () => {
    const out = normalizeOneWearableRow(
      {
        date: "2026-05-06",
        provider: "scale",
        weight: 180,
        muscleMass: 80,
      },
      undefined
    );
    expect(out.weight).toBe(180);
    expect(out.muscleMass).toBe(80);
  });

  it("converts kg to lbs using metadata", () => {
    const out = normalizeOneWearableRow(
      {
        date: "2026-05-06",
        provider: "scale",
        weight: 82,
        weightUnit: "kg",
        muscleMass: 35,
        muscleMassUnit: "kg",
      },
      undefined
    );
    expect(out.weight).toBeCloseTo(180.779, 1);
    expect(out.muscleMass).toBeCloseTo(77.16, 1);
    expect((out as Record<string, unknown>).weightUnit).toBeUndefined();
  });

  it("reconciles BMI when inconsistent with profile", () => {
    const profile = {
      unitSystem: "us" as const,
      height: 70,
      weight: 180,
      age: 30,
      name: "T",
      id: "1",
      gender: "male",
      fitnessLevel: "intermediate",
      goal: "maintain",
      dietaryRestrictions: [],
      injuriesOrLimitations: [],
      dailyActivityLevel: "moderate",
      createdAt: new Date().toISOString(),
    } as UserProfile;

    const heightIn = 70;
    const weightLbs = 180;
    const expected = bmiFromWeightLbsHeightIn(weightLbs, heightIn);

    const out = normalizeOneWearableRow(
      {
        date: "2026-05-06",
        provider: "scale",
        weight: weightLbs,
        weightUnit: "lbs",
        bmi: 12,
      },
      profile
    );
    expect(out.bmi).toBeCloseTo(expected, 0);
  });
});

describe("repairWearableScaleRowsForCanonicalLbs", () => {
  const metricProfile = {
    id: "1",
    name: "T",
    age: 30,
    gender: "male" as const,
    fitnessLevel: "intermediate" as const,
    goal: "maintain" as const,
    dietaryRestrictions: [],
    injuriesOrLimitations: [],
    dailyActivityLevel: "moderate" as const,
    unitSystem: "metric" as const,
    height: 177.8,
    weight: 83,
    createdAt: new Date().toISOString(),
  } as UserProfile;

  it("clears micro weight/muscle when body fat looks real (garbage scale rows)", () => {
    const rows = repairWearableScaleRowsForCanonicalLbs(
      [
        {
          date: "2026-05-04",
          provider: "scale",
          weight: 0.000011221526509595697,
          muscleMass: 0.000009334830294246094,
          bodyFatPercent: 12.5,
        },
      ],
      undefined
    );
    expect(rows[0].weight).toBeUndefined();
    expect(rows[0].muscleMass).toBeUndefined();
    expect(rows[0].bodyFatPercent).toBe(12.5);
  });

  it("converts kg mis-labeled as lbs for scale + profile height (screenshot case)", () => {
    const rows = repairWearableScaleRowsForCanonicalLbs(
      [
        {
          date: "2026-05-06",
          provider: "scale",
          weight: 83.098122184,
          muscleMass: 69.036758714,
          bodyFatPercent: 12.6,
        },
      ],
      metricProfile
    );
    expect(rows[0].weight).toBeCloseTo(183.2, 0);
    expect(rows[0].muscleMass).toBeCloseTo(152.2, 0);
  });

  it("does not alter non-scale rows", () => {
    const rows = repairWearableScaleRowsForCanonicalLbs(
      [
        {
          date: "2026-05-06",
          provider: "apple",
          weight: 83,
        },
      ],
      metricProfile
    );
    expect(rows[0].weight).toBe(83);
  });

  it("does not double-convert plausible lbs", () => {
    const usProfile = {
      ...metricProfile,
      unitSystem: "us" as const,
      height: 70,
      weight: 185,
    } as UserProfile;
    const rows = repairWearableScaleRowsForCanonicalLbs(
      [
        {
          date: "2026-05-06",
          provider: "scale",
          weight: 185,
          muscleMass: 145,
          bodyFatPercent: 14,
        },
      ],
      usProfile
    );
    expect(rows[0].weight).toBe(185);
    expect(rows[0].muscleMass).toBe(145);
  });

  it("does not treat typical lb readings in 100–125 range as kg (lbs-first default)", () => {
    const tallProfile = {
      id: "1",
      name: "T",
      age: 30,
      gender: "male" as const,
      fitnessLevel: "intermediate" as const,
      goal: "maintain" as const,
      dietaryRestrictions: [],
      injuriesOrLimitations: [],
      dailyActivityLevel: "moderate" as const,
      unitSystem: "us" as const,
      height: 74,
      weight: 180,
      createdAt: new Date().toISOString(),
    } as UserProfile;
    const rows = repairWearableScaleRowsForCanonicalLbs(
      [
        {
          date: "2026-05-06",
          provider: "scale",
          weight: 118,
          bodyFatPercent: 14,
        },
      ],
      tallProfile
    );
    expect(rows[0].weight).toBe(118);
  });
});
