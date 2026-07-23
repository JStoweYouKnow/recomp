import { describe, it, expect } from "vitest";
import type { FitnessPlan } from "./types";
import { exerciseProgressKey } from "./workout-schedule";
import {
  buildWorkoutHistorySummary,
  detectNewlyCompletedSession,
  findNextScheduledWorkout,
  getCompletedSessionForDate,
  listCompletedSessions,
} from "./workout-learning";

function makePlan(): FitnessPlan {
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
    },
  };
}

function completeSession(plan: FitnessPlan, date: string): Record<string, string> {
  const dayIdx = plan.workoutPlan.weeklyPlan.findIndex((d) => d.day === "Monday");
  const day = plan.workoutPlan.weeklyPlan[dayIdx];
  const ex = day.exercises[0];
  const key = exerciseProgressKey(plan.id, day, ex, "main");
  return { [key]: `${date}T18:00:00.000Z` };
}

describe("workout-learning", () => {
  it("detects when a session becomes newly complete", () => {
    const plan = makePlan();
    const oldProgress = {};
    const newProgress = completeSession(plan, "2026-06-29");
    const session = detectNewlyCompletedSession(plan, oldProgress, newProgress, "2026-06-29");
    expect(session).not.toBeNull();
    expect(session?.focus).toBe("Push");
    expect(session?.exercisesCompleted).toContain("Bench");
  });

  it("does not fire when session was already complete", () => {
    const plan = makePlan();
    const progress = completeSession(plan, "2026-06-29");
    const session = detectNewlyCompletedSession(plan, progress, progress, "2026-06-29");
    expect(session).toBeNull();
  });

  it("summarizes completed session for a date", () => {
    const plan = makePlan();
    const progress = completeSession(plan, "2026-06-29");
    const session = getCompletedSessionForDate(plan, progress, "2026-06-29");
    expect(session?.day).toBe("Monday");
    expect(session?.exerciseCount).toBe(1);
  });

  it("builds history with exercise frequency", () => {
    const plan = makePlan();
    const progress = completeSession(plan, "2026-06-29");
    const history = buildWorkoutHistorySummary(plan, progress, 14, "2026-06-30");
    expect(history.sessionsCompletedLast7Days).toBe(1);
    expect(history.exerciseFrequency.bench).toBe(1);
    expect(history.focusFrequency["push"]).toBe(1);
  });

  it("finds next incomplete scheduled workout", () => {
    const plan = makePlan();
    const progress = completeSession(plan, "2026-06-29");
    const next = findNextScheduledWorkout(plan, progress, "2026-06-29");
    expect(next).not.toBeNull();
    expect(next?.focus).toBe("Pull");
    expect(next?.mainExercises).toContain("Row");
  });

  it("lists multiple completed sessions in lookback window", () => {
    const plan = makePlan();
    const monday = completeSession(plan, "2026-06-29");
    const wednesdayDay = plan.workoutPlan.weeklyPlan[1];
    const wedKey = exerciseProgressKey(plan.id, wednesdayDay, wednesdayDay.exercises[0], "main");
    const progress = { ...monday, [wedKey]: "2026-07-01T18:00:00.000Z" };
    const sessions = listCompletedSessions(plan, progress, 14, "2026-07-02");
    expect(sessions.length).toBe(2);
  });
});
