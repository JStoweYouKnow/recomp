import { describe, it, expect } from "vitest";
import {
  computeMilestones,
  getBadgeInfo,
  OUTCOME_BADGES,
  xpToLevel,
  xpForNextLevel,
  type MilestoneExtras,
} from "./milestones";
import type { MealEntry, Macros, WorkoutSetLog } from "./types";

function makeMeal(date: string, macros: Macros = { calories: 2000, protein: 150, carbs: 200, fat: 65 }): MealEntry {
  return {
    id: `m-${date}`,
    date,
    mealType: "lunch",
    name: "Test",
    macros,
    loggedAt: new Date().toISOString(),
  };
}

describe("xpToLevel", () => {
  it("returns 1 for 0 XP", () => {
    expect(xpToLevel(0)).toBe(1);
  });
  it("returns 1 for 99 XP", () => {
    expect(xpToLevel(99)).toBe(1);
  });
  it("returns 2 for 100 XP", () => {
    expect(xpToLevel(100)).toBe(2);
  });
  it("returns 2 for 399 XP", () => {
    expect(xpToLevel(399)).toBe(2);
  });
  it("returns 3 for 400 XP", () => {
    expect(xpToLevel(400)).toBe(3);
  });
});

describe("xpForNextLevel", () => {
  it("returns 100 for 0 XP (need 100 for level 2)", () => {
    expect(xpForNextLevel(0)).toBe(100);
  });
  it("returns 75 for 25 XP", () => {
    expect(xpForNextLevel(25)).toBe(75);
  });
});

describe("getBadgeInfo", () => {
  it("returns all badge definitions", () => {
    const info = getBadgeInfo();
    expect(info.first_meal).toEqual({ name: "First Bite", desc: "Logged your first meal", xp: 25 });
    expect(Object.keys(info).length).toBeGreaterThanOrEqual(10);
  });
});

describe("computeMilestones", () => {
  const targets: Macros = { calories: 2000, protein: 150, carbs: 200, fat: 65 };

  it("awards first_meal when user has 1+ meal", () => {
    const meals = [makeMeal("2025-02-10")];
    const { newMilestones, xpGained } = computeMilestones(
      meals,
      null,
      targets,
      0,
      false,
      new Set()
    );
    expect(newMilestones).toContainEqual(
      expect.objectContaining({ id: "first_meal" })
    );
    expect(xpGained).toBe(25);
  });

  it("does not award first_meal if already earned", () => {
    const meals = [makeMeal("2025-02-10")];
    const { newMilestones, xpGained } = computeMilestones(
      meals,
      null,
      targets,
      0,
      false,
      new Set(["first_meal"])
    );
    expect(newMilestones).toHaveLength(0);
    expect(xpGained).toBe(0);
  });

  it("awards plan_adjuster when hasAdjustedPlan is true", () => {
    const meals: MealEntry[] = [];
    const { newMilestones } = computeMilestones(
      meals,
      null,
      targets,
      0,
      true,
      new Set()
    );
    expect(newMilestones).toContainEqual(
      expect.objectContaining({ id: "plan_adjuster" })
    );
  });

  it("returns progress for streak thresholds", () => {
    const today = new Date().toISOString().slice(0, 10);
    const meals = [
      makeMeal(today),
      makeMeal(new Date(Date.now() - 86400000).toISOString().slice(0, 10)),
    ];
    const { progress } = computeMilestones(
      meals,
      null,
      targets,
      0,
      false,
      new Set()
    );
    expect(progress.streak_3).toBeDefined();
    expect(progress.streak_3).toBeLessThanOrEqual(100);
  });

  it("handles empty meals without throwing", () => {
    const { newMilestones, progress } = computeMilestones(
      [],
      null,
      targets,
      0,
      false,
      new Set()
    );
    expect(newMilestones).toEqual([]);
    expect(progress).toBeDefined();
  });

  it("skips meals with missing date (malformed data)", () => {
    const malformed = [
      { ...makeMeal("2025-02-10"), date: undefined },
    ] as unknown as MealEntry[];
    const { newMilestones } = computeMilestones(
      malformed,
      null,
      targets,
      0,
      false,
      new Set()
    );
    expect(newMilestones).not.toContainEqual(expect.objectContaining({ id: "first_meal" }));
  });

  it("skips meals with missing macros without throwing", () => {
    const malformed = [
      { id: "1", date: "2025-02-10", mealType: "lunch" as const, name: "X", macros: undefined, loggedAt: new Date().toISOString() },
    ] as unknown as MealEntry[];
    const { progress } = computeMilestones(
      malformed,
      null,
      targets,
      0,
      false,
      new Set()
    );
    expect(progress.macro_week).toBeDefined();
  });

  it("handles large meals array without throwing (stress: 5000 meals)", () => {
    const today = new Date().toISOString().slice(0, 10);
    const meals = Array.from({ length: 5000 }, (_, i) => {
      const d = new Date(Date.now() - i * 86400000);
      return makeMeal(d.toISOString().slice(0, 10));
    });
    const { newMilestones, progress } = computeMilestones(
      meals,
      null,
      targets,
      0,
      false,
      new Set()
    );
    expect(newMilestones).toBeDefined();
    expect(progress).toBeDefined();
    expect(progress.streak_3).toBeDefined();
  });
});

// ── Transformation outcome badges ──

function setLog(
  date: string,
  exerciseName: string,
  setIndex: number,
  weightLbs: number,
  reps = 8,
): WorkoutSetLog {
  return {
    id: `${date}:${exerciseName}:${setIndex}`,
    date,
    planId: "plan-1",
    dayLabel: "Monday",
    section: "main",
    exerciseName,
    globalSlot: 0,
    setIndex,
    weightLbs,
    reps,
    loggedAt: `${date}T18:00:00.000Z`,
  };
}

/** computeMilestones with only the outcome inputs populated. */
function outcomes(extras: MilestoneExtras, earned = new Set<string>()) {
  const targets: Macros = { calories: 2000, protein: 150, carbs: 200, fat: 65 };
  return computeMilestones([], null, targets, 0, false, earned, extras);
}

describe("outcome milestones — strength", () => {
  it("awards a first PR only once a session beats the first", () => {
    const single = outcomes({ setLogs: [setLog("2026-05-01", "Bench Press", 0, 185)] });
    expect(single.newMilestones.map((m) => m.id)).not.toContain("first_pr");

    const improved = outcomes({
      setLogs: [setLog("2026-05-01", "Bench Press", 0, 185), setLog("2026-05-08", "Bench Press", 0, 195)],
    });
    expect(improved.newMilestones.map((m) => m.id)).toContain("first_pr");
  });

  it("tiers strength badges by percentage gain", () => {
    // 185 → 205 lb is ~10.8%
    const result = outcomes({
      setLogs: [setLog("2026-05-01", "Bench Press", 0, 185), setLog("2026-06-01", "Bench Press", 0, 205)],
    });
    const ids = result.newMilestones.map((m) => m.id);
    expect(ids).toContain("strength_up_5");
    expect(ids).toContain("strength_up_10");
    expect(ids).not.toContain("strength_up_25");
  });

  it("tracks progress toward the next strength badge", () => {
    const result = outcomes({
      setLogs: [setLog("2026-05-01", "Bench Press", 0, 200), setLog("2026-06-01", "Bench Press", 0, 205)],
    });
    expect(result.progress.strength_up_5).toBeGreaterThan(0);
    expect(result.progress.strength_up_5).toBeLessThan(100);
  });

  it("awards consistency after eight distinct training weeks", () => {
    const logs = Array.from({ length: 8 }, (_, week) => {
      const d = new Date("2026-05-04T12:00:00");
      d.setDate(d.getDate() + week * 7);
      return setLog(d.toISOString().slice(0, 10), "Bench Press", 0, 185);
    });
    expect(outcomes({ setLogs: logs }).newMilestones.map((m) => m.id)).toContain("consistent_lifter");
    expect(outcomes({ setLogs: logs.slice(0, 5) }).newMilestones.map((m) => m.id)).not.toContain(
      "consistent_lifter",
    );
  });

  it("awards the deload badge only when one was completed", () => {
    expect(outcomes({ completedDeload: true }).newMilestones.map((m) => m.id)).toContain("deload_completed");
    expect(outcomes({}).newMilestones.map((m) => m.id)).not.toContain("deload_completed");
  });
});

describe("outcome milestones — body composition", () => {
  /** Weigh-ins from `start` to `end` lbs across `days`. */
  function weighIns(start: number, end: number, days = 60, bfStart?: number, bfEnd?: number) {
    const out: { date: string; weight: number; bodyFatPercent?: number }[] = [];
    const base = new Date("2026-05-01T12:00:00");
    for (let d = 0; d <= days; d += 3) {
      const day = new Date(base);
      day.setDate(day.getDate() + d);
      const entry: { date: string; weight: number; bodyFatPercent?: number } = {
        date: day.toISOString().slice(0, 10),
        weight: start + ((end - start) * d) / days,
      };
      if (bfStart != null && bfEnd != null) {
        entry.bodyFatPercent = bfStart + ((bfEnd - bfStart) * d) / days;
      }
      out.push(entry);
    }
    return out;
  }

  it("tiers weight-loss badges off the trend, not a single weigh-in", () => {
    const ids = outcomes({ weighIns: weighIns(220, 200) }).newMilestones.map((m) => m.id);
    expect(ids).toContain("trend_down_5");
    expect(ids).toContain("trend_down_15");
    expect(ids).not.toContain("trend_down_30");
  });

  it("does not award weight loss for a single light day", () => {
    const spiky = [
      { date: "2026-05-01", weight: 200 },
      { date: "2026-05-02", weight: 200 },
      { date: "2026-05-03", weight: 199 },
      { date: "2026-05-04", weight: 188 }, // one anomalous reading
    ];
    expect(outcomes({ weighIns: spiky }).newMilestones.map((m) => m.id)).not.toContain("trend_down_5");
  });

  it("awards body-fat badges by percentage points dropped", () => {
    const ids = outcomes({ weighIns: weighIns(200, 190, 60, 25, 22) }).newMilestones.map((m) => m.id);
    expect(ids).toContain("bodyfat_down_2");
    expect(ids).not.toContain("bodyfat_down_5");
  });

  it("awards lean mass gain when fat-free mass climbs", () => {
    // 180 → 186 lb with body fat 18% → 15%: lean mass rises well past 3 lb.
    const ids = outcomes({ weighIns: weighIns(180, 186, 60, 18, 15) }).newMilestones.map((m) => m.id);
    expect(ids).toContain("lean_mass_gained");
  });

  it("awards a recomp only when fat falls and lean rises together", () => {
    const recomp = outcomes({ weighIns: weighIns(200, 198, 60, 25, 20) }).newMilestones.map((m) => m.id);
    expect(recomp).toContain("recomp_achieved");

    // Fat and lean both falling is a plain cut, not a recomp.
    const plainCut = outcomes({ weighIns: weighIns(200, 188, 60, 25, 24.5) }).newMilestones.map((m) => m.id);
    expect(plainCut).not.toContain("recomp_achieved");
  });
});

describe("outcome milestones — award semantics", () => {
  it("never re-awards a badge already earned", () => {
    const logs = [setLog("2026-05-01", "Bench Press", 0, 185), setLog("2026-06-01", "Bench Press", 0, 205)];
    const result = outcomes({ setLogs: logs }, new Set(["first_pr", "strength_up_5", "strength_up_10"]));
    const ids = result.newMilestones.map((m) => m.id);
    expect(ids).not.toContain("first_pr");
    expect(ids).not.toContain("strength_up_5");
  });

  it("awards nothing without transformation data", () => {
    const result = outcomes({});
    const outcomeIds = new Set<string>(OUTCOME_BADGES);
    expect(result.newMilestones.filter((m) => outcomeIds.has(m.id))).toHaveLength(0);
  });

  it("carries XP for outcome badges", () => {
    const result = outcomes({ completedDeload: true });
    expect(result.xpGained).toBeGreaterThan(0);
  });
});
