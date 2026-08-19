import { describe, it, expect } from "vitest";
import {
  buildMuscleLookup,
  classifyExercise,
  computePlannedVolume,
  computeWeeklyVolume,
  muscleLabel,
  normalizeTaggedMuscles,
  VOLUME_LANDMARKS,
} from "./muscle-volume";
import type { WorkoutExercise, WorkoutSetLog } from "./types";

// `reps` takes null (not undefined) for an unlogged set, so the default does not swallow it.
function log(
  date: string,
  exerciseName: string,
  setIndex: number,
  reps: number | null = 10,
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
    weightLbs: 100,
    reps: reps ?? undefined,
    loggedAt: `${date}T18:00:00.000Z`,
  };
}

/** n logged sets of one exercise on one date. */
function sets(date: string, name: string, count: number): WorkoutSetLog[] {
  return Array.from({ length: count }, (_, i) => log(date, name, i));
}

describe("classifyExercise", () => {
  it("resolves specific patterns before generic ones", () => {
    // "romanian deadlift" must not be captured by the generic /deadlift/ rule
    expect(classifyExercise("Romanian Deadlift").primary).toEqual(["hamstrings"]);
    expect(classifyExercise("Conventional Deadlift").primary).toEqual(["back", "hamstrings"]);
    // "leg extension" must not fall into the triceps "overhead extension" rule
    expect(classifyExercise("Leg Extension").primary).toEqual(["quads"]);
  });

  it("splits compound lifts into primary and secondary movers", () => {
    const bench = classifyExercise("Barbell Bench Press");
    expect(bench.primary).toEqual(["chest"]);
    expect(bench.secondary).toContain("triceps");

    const row = classifyExercise("Barbell Row");
    expect(row.primary).toEqual(["back"]);
    expect(row.secondary).toContain("biceps");
  });

  it("classifies isolation work to a single group", () => {
    expect(classifyExercise("Lateral Raise").primary).toEqual(["shoulders"]);
    expect(classifyExercise("Standing Calf Raise").primary).toEqual(["calves"]);
    expect(classifyExercise("Tricep Pushdown").primary).toEqual(["triceps"]);
  });

  it("prefers tagged muscles over the name heuristic", () => {
    // Name says chest; tags say back — tags win.
    const result = classifyExercise("Some Machine Press", ["lats", "biceps"]);
    expect(result.primary).toEqual(["back"]);
    expect(result.secondary).toEqual(["biceps"]);
  });

  it("returns empty for movements it cannot place", () => {
    expect(classifyExercise("Sled Drag").primary).toEqual([]);
    expect(classifyExercise("").primary).toEqual([]);
  });
});

describe("normalizeTaggedMuscles", () => {
  it("maps the ExerciseDB vocabulary onto canonical groups", () => {
    expect(normalizeTaggedMuscles(["pectorals"])).toEqual(["chest"]);
    expect(normalizeTaggedMuscles(["lats", "upper back"])).toEqual(["back"]);
    expect(normalizeTaggedMuscles(["delts"])).toEqual(["shoulders"]);
  });

  it("drops unknown terms instead of guessing", () => {
    expect(normalizeTaggedMuscles(["cardiovascular system"])).toEqual([]);
    expect(normalizeTaggedMuscles(undefined)).toEqual([]);
  });
});

describe("computeWeeklyVolume", () => {
  it("counts primary sets fully and secondary sets at half credit", () => {
    // 4 bench sets → chest 4, triceps 2, shoulders 2
    const summary = computeWeeklyVolume(sets("2026-07-01", "Bench Press", 4), "2026-06-29");
    const byMuscle = Object.fromEntries(summary.entries.map((e) => [e.muscle, e.sets]));

    expect(byMuscle.chest).toBe(4);
    expect(byMuscle.triceps).toBe(2);
    expect(byMuscle.shoulders).toBe(2);
    expect(summary.totalHardSets).toBe(4);
  });

  it("excludes warmups and unlogged sets", () => {
    const logs = [
      log("2026-07-01", "Bench Press", 0, 10, "warmup"),
      log("2026-07-01", "Bench Press", 1, null),
      log("2026-07-01", "Bench Press", 2, 10),
    ];
    expect(computeWeeklyVolume(logs, "2026-06-29").totalHardSets).toBe(1);
  });

  it("only counts the seven days from weekStart", () => {
    const logs = [
      ...sets("2026-06-28", "Bench Press", 3), // day before window
      ...sets("2026-06-29", "Bench Press", 3), // first day
      ...sets("2026-07-05", "Bench Press", 3), // last day
      ...sets("2026-07-06", "Bench Press", 3), // day after window
    ];
    expect(computeWeeklyVolume(logs, "2026-06-29").totalHardSets).toBe(6);
  });

  it("flags groups below MEV and above MRV", () => {
    const logs = [
      ...sets("2026-06-29", "Bicep Curl", 30), // way past biceps MRV (26)
      ...sets("2026-06-30", "Bench Press", 10), // chest above MEV (8)
    ];
    const summary = computeWeeklyVolume(logs, "2026-06-29");

    expect(summary.overdosed).toContain("biceps");
    expect(summary.underdosed).toContain("hamstrings"); // never trained
    expect(summary.underdosed).not.toContain("chest");
  });

  it("reports how many sets are needed to reach MEV", () => {
    const summary = computeWeeklyVolume(sets("2026-06-29", "Bench Press", 2), "2026-06-29");
    const chest = summary.entries.find((e) => e.muscle === "chest")!;

    expect(chest.sets).toBe(2);
    expect(chest.setsToMev).toBe(VOLUME_LANDMARKS.chest.mev - 2);
    expect(chest.status).toBe("under");
  });

  it("scales landmarks by training age", () => {
    const logs = sets("2026-06-29", "Bench Press", 6);
    const beginner = computeWeeklyVolume(logs, "2026-06-29", { fitnessLevel: "beginner" });
    const advanced = computeWeeklyVolume(logs, "2026-06-29", { fitnessLevel: "advanced" });

    // 6 chest sets clears a beginner's reduced MEV but not an advanced lifter's
    expect(beginner.entries.find((e) => e.muscle === "chest")!.status).toBe("optimal");
    expect(advanced.entries.find((e) => e.muscle === "chest")!.status).toBe("under");
  });

  it("surfaces exercises it could not classify", () => {
    const summary = computeWeeklyVolume(sets("2026-06-29", "Sled Drag", 3), "2026-06-29");
    expect(summary.unclassifiedExercises).toEqual(["Sled Drag"]);
    expect(summary.totalHardSets).toBe(3);
  });

  it("uses the tagged-muscle lookup when provided", () => {
    const summary = computeWeeklyVolume(sets("2026-06-29", "Mystery Machine", 4), "2026-06-29", {
      muscleLookup: { "mystery machine": ["glutes"] },
    });
    expect(summary.entries.find((e) => e.muscle === "glutes")!.sets).toBe(4);
    expect(summary.unclassifiedExercises).toEqual([]);
  });
});

describe("computePlannedVolume", () => {
  it("scores the program before anything is logged", () => {
    const day: WorkoutExercise[] = [
      { name: "Bench Press", sets: "4", reps: "8-12" },
      { name: "Incline Dumbbell Press", sets: "3", reps: "10" },
    ];
    const entries = computePlannedVolume([day, day]); // same session twice a week
    const chest = entries.find((e) => e.muscle === "chest")!;

    expect(chest.sets).toBe(14); // (4 + 3) × 2
    expect(chest.status).toBe("optimal");
  });

  it("honors muscles tagged on the exercise", () => {
    const day: WorkoutExercise[] = [
      { name: "Unknown Machine", sets: "5", reps: "10", muscles: ["hamstrings"] },
    ];
    expect(computePlannedVolume([day]).find((e) => e.muscle === "hamstrings")!.sets).toBe(5);
  });
});

describe("buildMuscleLookup", () => {
  it("indexes tagged exercises by lowercased name", () => {
    const day: WorkoutExercise[] = [
      { name: "Bench Press", sets: "3", reps: "10", muscles: ["pectorals"] },
      { name: "Untagged", sets: "3", reps: "10" },
    ];
    expect(buildMuscleLookup([day])).toEqual({ "bench press": ["pectorals"] });
  });
});

describe("muscleLabel", () => {
  it("title-cases group names", () => {
    expect(muscleLabel("hamstrings")).toBe("Hamstrings");
  });
});
