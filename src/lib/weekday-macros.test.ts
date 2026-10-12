import { describe, it, expect } from "vitest";
import type { FitnessPlan } from "./types";
import {
  effectiveWeekdayTargets,
  getWeekdayKeyFromDate,
  resolveMacroTargetsForDate,
  seedWeekdayTargetsFromPlan,
} from "./weekday-macros";

function makePlan(overrides?: Partial<FitnessPlan["dietPlan"]>): FitnessPlan {
  return {
    id: "p1",
    userId: "u1",
    createdAt: "2026-01-01T00:00:00.000Z",
    dietPlan: {
      dailyTargets: { calories: 2000, protein: 150, carbs: 200, fat: 65 },
      trainingTargets: { calories: 2200, protein: 150, carbs: 250, fat: 65 },
      restTargets: { calories: 1800, protein: 150, carbs: 150, fat: 65 },
      weeklyPlan: [],
      tips: [],
      ...overrides,
    },
    workoutPlan: {
      weeklyPlan: [
        { day: "Monday", focus: "Push", exercises: [{ name: "Bench", sets: "3", reps: "10" }] },
        { day: "Wednesday", focus: "Pull", exercises: [{ name: "Row", sets: "3", reps: "10" }] },
        { day: "Friday", focus: "Rest", exercises: [{ name: "Walk", sets: "1", reps: "30" }] },
      ],
      tips: [],
    },
  };
}

describe("weekday-macros", () => {
  it("maps dates to weekday keys", () => {
    expect(getWeekdayKeyFromDate("2026-06-01")).toBe("mon");
  });

  it("uses legacy training/rest when weekdayTargets unset", () => {
    const plan = makePlan();
    expect(resolveMacroTargetsForDate(plan, "2026-06-01").calories).toBe(2200);
    expect(resolveMacroTargetsForDate(plan, "2026-06-02").calories).toBe(1800);
  });

  it("prefers explicit weekday target", () => {
    const plan = makePlan({
      weekdayTargets: {
        mon: { calories: 2400, protein: 160, carbs: 260, fat: 70 },
      },
    });
    expect(resolveMacroTargetsForDate(plan, "2026-06-01").calories).toBe(2400);
    expect(resolveMacroTargetsForDate(plan, "2026-06-02").calories).toBe(1800);
  });

  it("seeds weekday map from workout schedule", () => {
    const seeded = seedWeekdayTargetsFromPlan(
      { calories: 2000, protein: 150, carbs: 200, fat: 65 },
      { calories: 2200, protein: 150, carbs: 250, fat: 65 },
      { calories: 1800, protein: 150, carbs: 150, fat: 65 },
      makePlan().workoutPlan.weeklyPlan
    );
    expect(seeded.mon.calories).toBe(2200);
    expect(seeded.fri.calories).toBe(1800);
    expect(seeded.tue.calories).toBe(1800);
  });

  it("effectiveWeekdayTargets fills all seven days", () => {
    const map = effectiveWeekdayTargets(makePlan());
    expect(Object.keys(map)).toHaveLength(7);
    expect(map.wed.calories).toBe(2200);
  });
});
