import { describe, it, expect } from "vitest";
import type { FitnessPlan } from "./types";
import {
  applyScheduleAction,
  detectMissedSessions,
  effectiveProgramWeek,
  getCatchUpQueue,
  matchDayToDate,
  shouldShowCatchUpBanner,
} from "./workout-schedule";

function makePlan(overrides: Partial<FitnessPlan["workoutPlan"]> = {}): FitnessPlan {
  return {
    id: "plan-1",
    userId: "user-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    dietPlan: { dailyTargets: { calories: 2000, protein: 150, carbs: 200, fat: 65 }, weeklyPlan: [], tips: [] },
    workoutPlan: {
      weeklyPlan: [
        { day: "Monday", focus: "Push", exercises: [{ name: "Bench", sets: "3", reps: "10" }] },
        { day: "Wednesday", focus: "Pull", exercises: [{ name: "Row", sets: "3", reps: "10" }] },
        { day: "Friday", focus: "Legs", exercises: [{ name: "Squat", sets: "3", reps: "8" }] },
      ],
      tips: [],
      ...overrides,
    },
  };
}

describe("matchDayToDate", () => {
  it("matches weekday names for classic plans", () => {
    const plan = makePlan();
    expect(matchDayToDate(plan, "2026-06-29")).not.toBeNull(); // Monday
    expect(matchDayToDate(plan, "2026-06-28")).toBeNull(); // Sunday rest
  });

  it("honors program week offset for multi-week plans", () => {
    const plan = makePlan({
      programWeek1Start: "2026-06-23",
      programWeekOffset: 1,
      weeklyPlan: [
        { day: "Monday — Week 1", focus: "W1 Push", exercises: [{ name: "A", sets: "3", reps: "10" }] },
        { day: "Monday — Week 2", focus: "W2 Push", exercises: [{ name: "B", sets: "3", reps: "10" }] },
      ],
    });
    // 2026-06-29 is Monday; calendar week 2, offset 1 → program week 1
    expect(matchDayToDate(plan, "2026-06-29")).toBe(0);
    expect(effectiveProgramWeek(plan, "2026-06-29")).toBe(1);
  });
});

describe("detectMissedSessions", () => {
  it("finds incomplete past sessions", () => {
    const plan = makePlan();
    const missed = detectMissedSessions(plan, {}, "2026-06-30", 7);
    expect(missed.length).toBeGreaterThan(0);
    expect(missed.some((s) => s.scheduledDate === "2026-06-29")).toBe(true); // Monday
  });

  it("ignores completed sessions", () => {
    const plan = makePlan();
    const mondayIdx = matchDayToDate(plan, "2026-06-29")!;
    const day = plan.workoutPlan.weeklyPlan[mondayIdx];
    const key = `${plan.id}:${day.day}:Bench:3:10:`;
    const progress = { [key]: "2026-06-29T18:00:00.000Z" };
    const missed = detectMissedSessions(plan, progress, "2026-06-30", 3);
    expect(missed.some((s) => s.scheduledDate === "2026-06-29")).toBe(false);
  });
});

describe("applyScheduleAction", () => {
  it("adds catch-up queue entries", () => {
    const plan = makePlan();
    const result = applyScheduleAction(plan, "catch_up", {}, { today: "2026-06-30" });
    expect(result.addedMissed.length).toBeGreaterThan(0);
    expect(getCatchUpQueue({ ...plan, workoutPlan: result.workoutPlan }).length).toBeGreaterThan(0);
  });

  it("increments program week offset on stay_on_week", () => {
    const plan = makePlan({ programWeek1Start: "2026-06-23", programWeekOffset: 0 });
    const result = applyScheduleAction(plan, "stay_on_week", {}, { today: "2026-06-30", weeksMissed: 1 });
    expect(result.workoutPlan.programWeekOffset).toBe(1);
  });
});

describe("shouldShowCatchUpBanner", () => {
  it("shows when multiple sessions missed in 7 days", () => {
    const plan = makePlan();
    expect(shouldShowCatchUpBanner(plan, {}, "2026-06-30")).toBe(true);
  });

  it("hides when dismissed today", () => {
    const plan = makePlan({ catchUpBannerDismissedAt: "2026-06-30T10:00:00.000Z" });
    expect(shouldShowCatchUpBanner(plan, {}, "2026-06-30")).toBe(false);
  });
});
