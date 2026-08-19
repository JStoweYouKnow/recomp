import { describe, it, expect } from "vitest";
import {
  buildAllProgressions,
  buildExerciseProgression,
  estimateOneRepMax,
  loadForReps,
  loadIncrementLbs,
  parseRepRange,
  parseSetTarget,
  prescribeNextSession,
  prescribeWorkoutDay,
  roundToLoadable,
  summarizeProgressions,
} from "./progression";
import type { WorkoutExercise, WorkoutSetLog } from "./types";

function log(
  date: string,
  exerciseName: string,
  setIndex: number,
  weightLbs?: number,
  reps?: number,
  rpe?: number,
  section: WorkoutSetLog["section"] = "main",
): WorkoutSetLog {
  return {
    id: `${date}:${exerciseName}:${setIndex}`,
    date,
    planId: "plan-1",
    dayLabel: "Monday",
    section,
    exerciseName,
    globalSlot: 0,
    setIndex,
    weightLbs,
    reps,
    rpe,
    loggedAt: `${date}T18:00:00.000Z`,
  };
}

const benchPress: WorkoutExercise = { name: "Bench Press", sets: "3", reps: "8-12" };

describe("estimateOneRepMax", () => {
  it("uses Epley when no RPE is given", () => {
    // 200 x 5 → 200 * (1 + 5/30) = 233.3
    expect(estimateOneRepMax(200, 5)).toBeCloseTo(233.33, 1);
  });

  it("credits reps in reserve when RPE is logged", () => {
    // 5 @ RPE 8 has ~2 in reserve → treated as 7 effective reps
    expect(estimateOneRepMax(200, 5, 8)).toBeCloseTo(246.67, 1);
    // RPE 10 = taken to failure = plain Epley
    expect(estimateOneRepMax(200, 5, 10)).toBeCloseTo(estimateOneRepMax(200, 5), 5);
  });

  it("returns 0 for missing or invalid input", () => {
    expect(estimateOneRepMax(0, 5)).toBe(0);
    expect(estimateOneRepMax(200, 0)).toBe(0);
  });

  it("inverts back to a working load", () => {
    const e1rm = estimateOneRepMax(200, 5);
    expect(loadForReps(e1rm, 5)).toBeCloseTo(200, 5);
  });
});

describe("parsing prescribed work", () => {
  it("parses rep ranges and single targets", () => {
    expect(parseRepRange("8-12")).toEqual({ min: 8, max: 12 });
    expect(parseRepRange("10")).toEqual({ min: 10, max: 10 });
    expect(parseRepRange("12 each side")).toEqual({ min: 12, max: 12 });
  });

  it("returns null for timed and open-ended work", () => {
    expect(parseRepRange("30 sec")).toBeNull();
    expect(parseRepRange("AMRAP")).toBeNull();
    expect(parseRepRange(undefined)).toBeNull();
  });

  it("parses set counts, defaulting sanely", () => {
    expect(parseSetTarget("3")).toBe(3);
    expect(parseSetTarget("3-4 sets")).toBe(4);
    expect(parseSetTarget("nonsense")).toBe(3);
  });
});

describe("load increments", () => {
  it("scales the jump to the movement", () => {
    expect(loadIncrementLbs("Back Squat")).toBe(10);
    expect(loadIncrementLbs("Romanian Deadlift")).toBe(10);
    expect(loadIncrementLbs("Bench Press")).toBe(5);
    expect(loadIncrementLbs("Dumbbell Shoulder Press")).toBe(5);
    expect(loadIncrementLbs("Bicep Curl")).toBe(2.5);
    expect(loadIncrementLbs("Lateral Raise")).toBe(2.5);
  });

  it("rounds to loadable plates", () => {
    expect(roundToLoadable(183, 10)).toBe(185);
    expect(roundToLoadable(31.2, 2.5)).toBe(30);
  });
});

describe("buildExerciseProgression", () => {
  it("collapses a session to its best set and tracks the trend", () => {
    const logs = [
      log("2026-07-01", "Bench Press", 0, 185, 8),
      log("2026-07-01", "Bench Press", 1, 185, 7),
      log("2026-07-08", "Bench Press", 0, 190, 8),
      log("2026-07-15", "Bench Press", 0, 195, 9),
    ];
    const p = buildExerciseProgression(logs, "Bench Press");

    expect(p.sessions).toHaveLength(3);
    expect(p.sessions[0].topSetWeightLbs).toBe(185);
    expect(p.sessions[0].topSetReps).toBe(8);
    expect(p.trend).toBe("climbing");
    expect(p.changePct).toBeGreaterThan(0);
    expect(p.stalled).toBe(false);
  });

  it("ignores warmup sets", () => {
    const logs = [
      log("2026-07-01", "Bench Press", 0, 500, 5, undefined, "warmup"),
      log("2026-07-01", "Bench Press", 1, 185, 8),
    ];
    const p = buildExerciseProgression(logs, "Bench Press");
    expect(p.sessions).toHaveLength(1);
    expect(p.sessions[0].topSetWeightLbs).toBe(185);
  });

  it("matches exercise names case-insensitively", () => {
    const logs = [log("2026-07-01", "bench press ", 0, 185, 8)];
    expect(buildExerciseProgression(logs, "Bench Press").sessions).toHaveLength(1);
  });

  it("flags a stall after three sessions without a new best", () => {
    const logs = [
      log("2026-07-01", "Bench Press", 0, 200, 8),
      log("2026-07-08", "Bench Press", 0, 195, 8),
      log("2026-07-15", "Bench Press", 0, 195, 8),
      log("2026-07-22", "Bench Press", 0, 190, 8),
    ];
    const p = buildExerciseProgression(logs, "Bench Press");
    expect(p.sessionsSinceBest).toBe(3);
    expect(p.stalled).toBe(true);
    expect(p.trend).toBe("declining");
  });

  it("reports insufficient data when nothing usable is logged", () => {
    const p = buildExerciseProgression([log("2026-07-01", "Bench Press", 0)], "Bench Press");
    expect(p.trend).toBe("insufficient_data");
    expect(p.sessions).toHaveLength(0);
  });

  it("builds one progression per distinct exercise", () => {
    const logs = [
      log("2026-07-01", "Bench Press", 0, 185, 8),
      log("2026-07-01", "Back Squat", 0, 275, 5),
    ];
    expect(buildAllProgressions(logs)).toHaveLength(2);
  });
});

describe("prescribeNextSession", () => {
  it("asks for a baseline when there is no history", () => {
    const rx = prescribeNextSession(benchPress, undefined);
    expect(rx.action).toBe("establish_baseline");
    expect(rx.targetWeightLbs).toBeUndefined();
    expect(rx.confidence).toBe("low");
  });

  it("adds load after topping the rep range with reps to spare", () => {
    const logs = [
      log("2026-07-01", "Bench Press", 0, 185, 10, 7),
      log("2026-07-08", "Bench Press", 0, 185, 12, 8),
    ];
    const rx = prescribeNextSession(benchPress, buildExerciseProgression(logs, "Bench Press"));

    expect(rx.action).toBe("add_load");
    expect(rx.targetWeightLbs).toBe(190);
    expect(rx.targetReps).toBe(8); // resets to bottom of range
    expect(rx.rationale).toContain("190");
  });

  it("adds a rep when short of the top of the range", () => {
    const logs = [log("2026-07-08", "Bench Press", 0, 185, 9, 8)];
    const rx = prescribeNextSession(benchPress, buildExerciseProgression(logs, "Bench Press"));

    expect(rx.action).toBe("add_reps");
    expect(rx.targetWeightLbs).toBe(185);
    expect(rx.targetReps).toBe(10);
  });

  it("holds load when the last top set was a grind", () => {
    const logs = [log("2026-07-08", "Bench Press", 0, 185, 9, 10)];
    const rx = prescribeNextSession(benchPress, buildExerciseProgression(logs, "Bench Press"));

    expect(rx.action).toBe("hold");
    expect(rx.targetWeightLbs).toBe(185);
    expect(rx.rationale).toContain("RPE 10");
  });

  it("does not add load at the top of the range if the set was maximal", () => {
    const logs = [log("2026-07-08", "Bench Press", 0, 185, 12, 10)];
    const rx = prescribeNextSession(benchPress, buildExerciseProgression(logs, "Bench Press"));
    expect(rx.action).not.toBe("add_load");
  });

  it("deloads a stalled lift by 10 percent", () => {
    const logs = [
      log("2026-07-01", "Back Squat", 0, 300, 5, 8),
      log("2026-07-08", "Back Squat", 0, 290, 5, 8),
      log("2026-07-15", "Back Squat", 0, 290, 5, 9),
      log("2026-07-22", "Back Squat", 0, 285, 5, 9),
    ];
    const squat: WorkoutExercise = { name: "Back Squat", sets: "4", reps: "5-8" };
    const rx = prescribeNextSession(squat, buildExerciseProgression(logs, "Back Squat"));

    expect(rx.action).toBe("deload");
    expect(rx.targetWeightLbs).toBe(255); // 285 * 0.9 = 256.5 → nearest 5
    expect(rx.rationale).toContain("plateau");
  });

  it("suppresses load increases when recovery is low", () => {
    const logs = [log("2026-07-08", "Bench Press", 0, 185, 12, 7)];
    const progression = buildExerciseProgression(logs, "Bench Press");

    expect(prescribeNextSession(benchPress, progression).action).toBe("add_load");
    const tired = prescribeNextSession(benchPress, progression, { readinessScore: 45 });
    expect(tired.action).toBe("hold");
    expect(tired.targetWeightLbs).toBe(185);
    expect(tired.rationale).toContain("45/100");
  });

  it("scales the prescribed load by the intensity multiplier", () => {
    const logs = [log("2026-07-08", "Bench Press", 0, 200, 9, 8)];
    const progression = buildExerciseProgression(logs, "Bench Press");
    const rx = prescribeNextSession(benchPress, progression, { intensityMultiplier: 0.9 });
    expect(rx.targetWeightLbs).toBe(180);
  });

  it("skips load prescription for timed work", () => {
    const plank: WorkoutExercise = { name: "Plank", sets: "3", reps: "45 sec" };
    const rx = prescribeNextSession(plank, undefined);
    expect(rx.action).toBe("hold");
    expect(rx.targetWeightLbs).toBeUndefined();
  });

  it("marks confidence low when reps exceed the reliable e1RM window", () => {
    const highRep: WorkoutExercise = { name: "Leg Extension", sets: "3", reps: "15-20" };
    const logs = [log("2026-07-08", "Leg Extension", 0, 90, 18, 8)];
    const rx = prescribeNextSession(highRep, buildExerciseProgression(logs, "Leg Extension"));
    expect(rx.confidence).toBe("low");
  });

  it("prescribes a whole day at once", () => {
    const logs = [
      log("2026-07-08", "Bench Press", 0, 185, 12, 7),
      log("2026-07-08", "Bicep Curl", 0, 30, 12, 8),
    ];
    const day: WorkoutExercise[] = [
      benchPress,
      { name: "Bicep Curl", sets: "3", reps: "10-12" },
    ];
    const rxs = prescribeWorkoutDay(day, logs);

    expect(rxs).toHaveLength(2);
    expect(rxs[0].targetWeightLbs).toBe(190);
    expect(rxs[1].targetWeightLbs).toBe(32.5); // isolation → 2.5 lb jump
  });
});

describe("summarizeProgressions", () => {
  it("separates climbing lifts from stalled ones and surfaces recent PRs", () => {
    const logs = [
      log("2026-07-01", "Bench Press", 0, 185, 8, 8),
      log("2026-07-08", "Bench Press", 0, 195, 8, 8),
      log("2026-06-01", "Back Squat", 0, 300, 5, 8),
      log("2026-06-08", "Back Squat", 0, 290, 5, 8),
      log("2026-06-15", "Back Squat", 0, 290, 5, 8),
      log("2026-06-22", "Back Squat", 0, 285, 5, 8),
    ];
    const summary = summarizeProgressions(buildAllProgressions(logs), 14, "2026-07-10");

    expect(summary.trackedExercises).toBe(2);
    expect(summary.climbing).toContain("Bench Press");
    expect(summary.stalled).toContain("Back Squat");
    expect(summary.recentPrs.map((p) => p.exerciseName)).toEqual(["Bench Press"]);
    expect(summary.topGains[0].exerciseName).toBe("Bench Press");
  });
});
