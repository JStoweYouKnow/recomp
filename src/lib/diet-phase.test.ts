import { describe, it, expect } from "vitest";
import {
  assessDietPhase,
  computeLeanMassSignal,
  computeWeightTrend,
  dietPhaseLabel,
  type DietPhaseInput,
} from "./diet-phase";

/** Weigh-ins every `stepDays` days, changing by `deltaPerWeek` lbs per week. */
function series(
  startWeight: number,
  weeks: number,
  deltaPerWeek: number,
  stepDays = 2,
  bodyFatStart?: number,
  bodyFatEnd?: number,
): { date: string; weight: number; bodyFatPercent?: number }[] {
  const out: { date: string; weight: number; bodyFatPercent?: number }[] = [];
  const totalDays = weeks * 7;
  const start = new Date("2026-05-01T12:00:00");

  for (let day = 0; day <= totalDays; day += stepDays) {
    const d = new Date(start);
    d.setDate(d.getDate() + day);
    const weight = startWeight + (deltaPerWeek * day) / 7;
    const point: { date: string; weight: number; bodyFatPercent?: number } = {
      date: d.toISOString().slice(0, 10),
      weight: Math.round(weight * 10) / 10,
    };
    if (bodyFatStart != null && bodyFatEnd != null) {
      point.bodyFatPercent =
        Math.round((bodyFatStart + ((bodyFatEnd - bodyFatStart) * day) / totalDays) * 10) / 10;
    }
    out.push(point);
  }
  return out;
}

function input(overrides: Partial<DietPhaseInput> = {}): DietPhaseInput {
  return {
    goal: "lose_weight",
    weighIns: series(200, 6, -1.5),
    currentCalories: 2200,
    ...overrides,
  };
}

describe("computeWeightTrend", () => {
  it("smooths daily noise into a trend", () => {
    const noisy = [
      { date: "2026-05-01", weight: 200 },
      { date: "2026-05-02", weight: 204 }, // water spike
      { date: "2026-05-03", weight: 199 },
      { date: "2026-05-04", weight: 200 },
      { date: "2026-05-10", weight: 198 },
      { date: "2026-05-15", weight: 197 },
    ];
    const trend = computeWeightTrend(noisy);

    // The trend must not chase the 204 spike.
    expect(trend.trendWeightLbs).toBeLessThan(201);
    expect(trend.trendWeightLbs).toBeGreaterThan(197);
    expect(trend.latestWeightLbs).toBe(197);
    expect(trend.reliable).toBe(true);
  });

  it("reports weekly rate as both lbs and percent", () => {
    const trend = computeWeightTrend(series(200, 8, -2));
    expect(trend.weeklyChangeLbs).toBeLessThan(0);
    expect(trend.weeklyChangePct).toBeLessThan(0);
    expect(Math.abs(trend.weeklyChangePct)).toBeCloseTo(Math.abs(trend.weeklyChangeLbs) / trend.trendWeightLbs, 3);
  });

  it("is unreliable without enough data", () => {
    expect(computeWeightTrend([]).reliable).toBe(false);
    expect(computeWeightTrend([{ date: "2026-05-01", weight: 200 }]).reliable).toBe(false);
    // Enough weigh-ins but too short a span
    expect(
      computeWeightTrend([
        { date: "2026-05-01", weight: 200 },
        { date: "2026-05-02", weight: 200 },
        { date: "2026-05-03", weight: 199 },
        { date: "2026-05-04", weight: 199 },
      ]).reliable,
    ).toBe(false);
  });

  it("ignores entries without a weight", () => {
    const trend = computeWeightTrend([
      { date: "2026-05-01", weight: 200 },
      { date: "2026-05-05", weight: undefined },
      { date: "2026-05-20", weight: 196 },
    ]);
    expect(trend.weighInCount).toBe(2);
  });
});

describe("computeLeanMassSignal", () => {
  it("flags when too much of the loss is lean mass", () => {
    // 200 → 190 lb, body fat 20% → 19.5%: lean falls ~7 lb of the 10 lb lost.
    const signal = computeLeanMassSignal(series(200, 6, -1.67, 3, 20, 19.5))!;
    expect(signal.leanChangeLbs).toBeLessThan(0);
    expect(signal.leanShareOfLoss).toBeGreaterThan(0.25);
    expect(signal.losingLeanMass).toBe(true);
  });

  it("stays quiet when fat is doing the leaving", () => {
    // 200 → 190 lb, body fat 25% → 20%: lean mass actually rises.
    const signal = computeLeanMassSignal(series(200, 6, -1.67, 3, 25, 20))!;
    expect(signal.losingLeanMass).toBe(false);
  });

  it("returns undefined without body fat readings", () => {
    expect(computeLeanMassSignal(series(200, 6, -1.5))).toBeUndefined();
  });
});

describe("assessDietPhase — cut", () => {
  it("holds steady at a productive rate", () => {
    // ~1.4 lb/week on 200 lb ≈ 0.7%/week
    const result = assessDietPhase(input({ weighIns: series(200, 6, -1.4) }));
    expect(result.phase).toBe("cut");
    expect(result.rateVerdict).toBe("on_track");
    expect(result.calorieAdjustment).toBe(0);
    expect(result.headline).toContain("productive range");
  });

  it("adds calories back when the cut is too aggressive", () => {
    // ~4 lb/week on 200 lb = 2%/week
    const result = assessDietPhase(input({ weighIns: series(200, 6, -4) }));
    expect(result.rateVerdict).toBe("too_fast");
    expect(result.calorieAdjustment).toBeGreaterThan(0);
    expect(result.details.join(" ")).toContain("muscle");
  });

  it("trims calories when loss is too slow", () => {
    const result = assessDietPhase(input({ weighIns: series(200, 6, -0.4) }));
    expect(result.rateVerdict).toBe("too_slow");
    expect(result.calorieAdjustment).toBeLessThan(0);
  });

  it("recognizes a stall and suggests a break after several weeks", () => {
    const result = assessDietPhase(input({ weighIns: series(200, 5, 0) }));
    expect(result.rateVerdict).toBe("stalled");
    expect(result.calorieAdjustment).toBeLessThan(0);
    expect(result.suggestedPhase).toBe("diet_break");
  });

  it("calls a diet break after a long deficit", () => {
    const result = assessDietPhase(
      input({ weighIns: series(200, 6, -1.4), weeksInDeficit: 14, estimatedTDEE: 2700 }),
    );
    expect(result.dietBreakDue).toBe(true);
    expect(result.suggestedPhase).toBe("diet_break");
    expect(result.calorieAdjustment).toBeGreaterThan(0);
    expect(result.headline).toContain("diet break");
  });

  it("overrides an acceptable rate when lean mass is going", () => {
    const result = assessDietPhase(
      input({ weighIns: series(200, 6, -1.4, 3, 20, 19.5) }),
    );
    expect(result.leanMass?.losingLeanMass).toBe(true);
    expect(result.details[0]).toContain("lean mass");
    expect(result.calorieAdjustment).toBeGreaterThan(0);
  });
});

describe("assessDietPhase — lean bulk", () => {
  it("holds at a lean-bulk pace", () => {
    // ~0.7 lb/week on 180 lb ≈ 0.39%/week
    const result = assessDietPhase(
      input({ goal: "build_muscle", weighIns: series(180, 6, 0.7), currentCalories: 3000 }),
    );
    expect(result.phase).toBe("lean_bulk");
    expect(result.rateVerdict).toBe("on_track");
    expect(result.calorieAdjustment).toBe(0);
  });

  it("pulls back when gaining too fast", () => {
    const result = assessDietPhase(
      input({ goal: "build_muscle", weighIns: series(180, 6, 2), currentCalories: 3400 }),
    );
    expect(result.rateVerdict).toBe("too_fast");
    expect(result.calorieAdjustment).toBeLessThan(0);
    expect(result.details.join(" ")).toContain("fat");
  });

  it("adds calories when the scale is flat", () => {
    const result = assessDietPhase(
      input({ goal: "build_muscle", weighIns: series(180, 6, 0), currentCalories: 2800 }),
    );
    expect(result.rateVerdict).toBe("stalled");
    expect(result.calorieAdjustment).toBeGreaterThan(0);
  });

  it("corrects an accidental deficit", () => {
    const result = assessDietPhase(
      input({ goal: "build_muscle", weighIns: series(180, 6, -1), currentCalories: 2600 }),
    );
    expect(result.rateVerdict).toBe("wrong_direction");
    expect(result.calorieAdjustment).toBeGreaterThan(0);
  });
});

describe("assessDietPhase — maintenance", () => {
  it("approves a flat trend", () => {
    const result = assessDietPhase(
      input({ goal: "maintain", weighIns: series(180, 6, 0.05), currentCalories: 2600 }),
    );
    expect(result.phase).toBe("maintenance");
    expect(result.rateVerdict).toBe("on_track");
    expect(result.calorieAdjustment).toBe(0);
  });

  it("corrects drift in either direction", () => {
    const up = assessDietPhase(
      input({ goal: "maintain", weighIns: series(180, 6, 1), currentCalories: 2600 }),
    );
    expect(up.calorieAdjustment).toBeLessThan(0);

    const down = assessDietPhase(
      input({ goal: "maintain", weighIns: series(180, 6, -1), currentCalories: 2600 }),
    );
    expect(down.calorieAdjustment).toBeGreaterThan(0);
  });
});

describe("assessDietPhase — guardrails", () => {
  it("changes nothing when the data is too thin", () => {
    const result = assessDietPhase(input({ weighIns: [{ date: "2026-05-01", weight: 200 }] }));
    expect(result.calorieAdjustment).toBe(0);
    expect(result.headline).toContain("Not enough weigh-ins");
  });

  it("surfaces a drifting TDEE estimate once it is confident", () => {
    const result = assessDietPhase(
      input({ weighIns: series(200, 6, -1.4), currentCalories: 2200, estimatedTDEE: 2800, tdeeConfidence: 70 }),
    );
    expect(result.details.join(" ")).toContain("2800");
  });

  it("stays quiet about TDEE when confidence is low", () => {
    const result = assessDietPhase(
      input({ weighIns: series(200, 6, -1.4), currentCalories: 2200, estimatedTDEE: 2800, tdeeConfidence: 20 }),
    );
    expect(result.details.join(" ")).not.toContain("2800");
  });
});

describe("dietPhaseLabel", () => {
  it("labels every phase", () => {
    expect(dietPhaseLabel("cut")).toBe("Cut");
    expect(dietPhaseLabel("diet_break")).toBe("Diet break");
    expect(dietPhaseLabel("lean_bulk")).toBe("Lean bulk");
    expect(dietPhaseLabel("maintenance")).toBe("Maintenance");
    expect(dietPhaseLabel("recomp")).toBe("Recomp");
  });
});
