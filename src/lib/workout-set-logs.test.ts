import { describe, it, expect } from "vitest";
import {
  buildWorkoutSetLog,
  buildWorkoutPerformanceSummary,
  logsForExerciseOnDate,
  mergeWorkoutSetLogs,
  removeWorkoutSetLog,
  upsertWorkoutSetLog,
  workoutSetLogId,
} from "./workout-set-logs";

describe("workout-set-logs", () => {
  it("builds stable ids from plan/date/slot", () => {
    const id = workoutSetLogId({
      planId: "plan-1",
      date: "2026-06-29",
      dayLabel: "Monday",
      section: "main",
      exerciseName: "Bench Press",
      globalSlot: 2,
      setIndex: 1,
    });
    expect(id).toBe("plan-1:2026-06-29:Monday:main:bench press:2:set_1");
  });

  it("upserts and removes logs by id", () => {
    const entry = buildWorkoutSetLog({
      planId: "plan-1",
      date: "2026-06-29",
      dayLabel: "Monday",
      section: "main",
      exercise: { name: "Squat", sets: "3", reps: "5" },
      globalSlot: 0,
      setIndex: 0,
      weightLbs: 225,
      reps: 5,
      rpe: 8,
    });
    let logs = upsertWorkoutSetLog([], entry);
    expect(logs).toHaveLength(1);
    expect(logs[0].weightLbs).toBe(225);

    const updated = { ...entry, weightLbs: 235, loggedAt: new Date().toISOString() };
    logs = upsertWorkoutSetLog(logs, updated);
    expect(logs).toHaveLength(1);
    expect(logs[0].weightLbs).toBe(235);

    logs = removeWorkoutSetLog(logs, entry.id);
    expect(logs).toHaveLength(0);
  });

  it("merges logs keeping newer loggedAt per id", () => {
    const base = buildWorkoutSetLog({
      planId: "plan-1",
      date: "2026-06-29",
      dayLabel: "Monday",
      section: "main",
      exercise: { name: "Deadlift", sets: "1", reps: "5" },
      globalSlot: 0,
      setIndex: 0,
      weightLbs: 315,
      reps: 5,
    });
    const local = [{ ...base, loggedAt: "2026-06-29T20:00:00.000Z" }];
    const remote = [{ ...base, weightLbs: 325, loggedAt: "2026-06-29T18:00:00.000Z" }];
    const merged = mergeWorkoutSetLogs(local, remote);
    expect(merged[0].weightLbs).toBe(315);
  });

  it("filters logs for exercise on date", () => {
    const entry = buildWorkoutSetLog({
      planId: "plan-1",
      date: "2026-06-29",
      dayLabel: "Monday",
      section: "main",
      exercise: { name: "Row", sets: "3", reps: "10" },
      globalSlot: 1,
      setIndex: 0,
      reps: 10,
    });
    const logs = [entry];
    const found = logsForExerciseOnDate(logs, "plan-1", "2026-06-29", "Monday", "main", "Row", 1);
    expect(found).toHaveLength(1);
    expect(logsForExerciseOnDate(logs, "plan-1", "2026-06-29", "Monday", "main", "Row", 0)).toHaveLength(0);
  });

  it("summarizes recent performance highlights", () => {
    const logs = [
      buildWorkoutSetLog({
        planId: "plan-1",
        date: "2026-06-28",
        dayLabel: "Monday",
        section: "main",
        exercise: { name: "Bench", sets: "3", reps: "8" },
        globalSlot: 0,
        setIndex: 0,
        weightLbs: 185,
        reps: 8,
      }),
      buildWorkoutSetLog({
        planId: "plan-1",
        date: "2026-06-28",
        dayLabel: "Monday",
        section: "main",
        exercise: { name: "Bench", sets: "3", reps: "8" },
        globalSlot: 0,
        setIndex: 1,
        weightLbs: 185,
        reps: 8,
      }),
    ];
    const summary = buildWorkoutPerformanceSummary(logs, 28, "2026-06-29");
    expect(summary.recentHighlights[0]?.exerciseName).toBe("Bench");
    expect(summary.recentHighlights[0]?.bestWeightLbs).toBe(185);
    expect(summary.lastSessionVolumeLbs).toBe(185 * 8 * 2);
  });
});
