import { describe, it, expect } from "vitest";
import {
  assessDeloadNeed,
  blockPosition,
  buildFatigueSignals,
  clampBlockLength,
  DEFAULT_BLOCK_LENGTH,
  hasCompletedDeloadWeek,
  mesocycleStateForWeek,
  phaseLabel,
  resolveMesocycle,
  rpeCreep,
  type FatigueSignals,
} from "./mesocycle";
import { buildExerciseProgression, prescribeNextSession } from "./progression";
import type { WorkoutExercise, WorkoutSetLog } from "./types";

function log(date: string, exerciseName: string, setIndex: number, rpe?: number): WorkoutSetLog {
  return {
    id: `${date}:${exerciseName}:${setIndex}`,
    date,
    planId: "plan-1",
    dayLabel: "Monday",
    section: "main",
    exerciseName,
    globalSlot: 0,
    setIndex,
    weightLbs: 185,
    reps: 8,
    rpe,
    loggedAt: `${date}T18:00:00.000Z`,
  };
}

const noFatigue: FatigueSignals = {
  stalledLifts: 0,
  rpeCreep: 0,
  musclesOverMrv: 0,
  missedSessions: 0,
};

describe("block position", () => {
  it("clamps block length to a trainable range", () => {
    expect(clampBlockLength(5)).toBe(5);
    expect(clampBlockLength(1)).toBe(3);
    expect(clampBlockLength(99)).toBe(8);
    expect(clampBlockLength("nonsense")).toBe(DEFAULT_BLOCK_LENGTH);
  });

  it("maps continuous program weeks onto repeating blocks", () => {
    expect(blockPosition(1, 5)).toEqual({ weekInBlock: 1, blockNumber: 1 });
    expect(blockPosition(5, 5)).toEqual({ weekInBlock: 5, blockNumber: 1 });
    expect(blockPosition(6, 5)).toEqual({ weekInBlock: 1, blockNumber: 2 });
    expect(blockPosition(12, 5)).toEqual({ weekInBlock: 2, blockNumber: 3 });
  });
});

describe("mesocycleStateForWeek", () => {
  it("ramps volume across accumulation weeks", () => {
    const w1 = mesocycleStateForWeek(1, 5);
    const w2 = mesocycleStateForWeek(2, 5);
    const w3 = mesocycleStateForWeek(3, 5);

    expect(w1.phase).toBe("accumulation");
    expect(w1.volumeMultiplier).toBe(0.85);
    expect(w2.volumeMultiplier).toBeGreaterThan(w1.volumeMultiplier);
    expect(w3.volumeMultiplier).toBe(1.15);
    expect(w3.intensityMultiplier).toBe(1);
  });

  it("peaks intensity in the second-to-last week", () => {
    const peak = mesocycleStateForWeek(4, 5);
    expect(peak.phase).toBe("peak");
    expect(peak.intensityMultiplier).toBeGreaterThan(1);
    expect(peak.volumeMultiplier).toBe(1);
  });

  it("deloads on the final week of the block", () => {
    const deload = mesocycleStateForWeek(5, 5);
    expect(deload.phase).toBe("deload");
    expect(deload.volumeMultiplier).toBe(0.5);
    expect(deload.intensityMultiplier).toBe(0.9);
    expect(deload.summary).toContain("Deload");
  });

  it("restarts the shape on the next block", () => {
    expect(mesocycleStateForWeek(6, 5).phase).toBe("accumulation");
    expect(mesocycleStateForWeek(6, 5).blockNumber).toBe(2);
    expect(mesocycleStateForWeek(10, 5).phase).toBe("deload");
  });

  it("omits the peak week in short blocks", () => {
    // A 3-week block is two accumulation weeks then a deload.
    expect(mesocycleStateForWeek(1, 3).phase).toBe("accumulation");
    expect(mesocycleStateForWeek(2, 3).phase).toBe("accumulation");
    expect(mesocycleStateForWeek(3, 3).phase).toBe("deload");
  });
});

describe("rpeCreep", () => {
  it("detects the same loads feeling harder", () => {
    const logs = [
      // Prior week: RPE 7
      log("2026-06-24", "Bench Press", 0, 7),
      log("2026-06-26", "Bench Press", 1, 7),
      // Recent week: RPE 9
      log("2026-07-01", "Bench Press", 0, 9),
      log("2026-07-03", "Bench Press", 1, 9),
    ];
    expect(rpeCreep(logs, 7, "2026-07-05")).toBe(2);
  });

  it("returns 0 without both windows populated", () => {
    expect(rpeCreep([log("2026-07-01", "Bench Press", 0, 8)], 7, "2026-07-05")).toBe(0);
    expect(rpeCreep([], 7, "2026-07-05")).toBe(0);
  });

  it("ignores warmups and unrated sets", () => {
    const logs = [
      { ...log("2026-06-24", "Bench Press", 0, 7), section: "warmup" as const },
      log("2026-06-26", "Bench Press", 1),
      log("2026-07-01", "Bench Press", 0, 9),
    ];
    expect(rpeCreep(logs, 7, "2026-07-05")).toBe(0);
  });
});

describe("assessDeloadNeed", () => {
  it("stays quiet when nothing is wrong", () => {
    const result = assessDeloadNeed(noFatigue);
    expect(result.shouldDeload).toBe(false);
    expect(result.urgency).toBe("none");
    expect(result.score).toBe(0);
  });

  it("does not trust a single weak signal", () => {
    const result = assessDeloadNeed({ ...noFatigue, stalledLifts: 1 });
    expect(result.shouldDeload).toBe(false);
    expect(result.urgency).toBe("none");
  });

  it("calls a deload when signals stack up", () => {
    const result = assessDeloadNeed({
      stalledLifts: 2, // 30
      rpeCreep: 0.6, // 25
      musclesOverMrv: 0,
      missedSessions: 0,
    });
    expect(result.score).toBe(55);
    expect(result.urgency).toBe("now");
    expect(result.shouldDeload).toBe(true);
    expect(result.reasons.length).toBeGreaterThanOrEqual(2);
  });

  it("warns before it insists", () => {
    const result = assessDeloadNeed({ ...noFatigue, stalledLifts: 2 });
    expect(result.urgency).toBe("soon");
    expect(result.shouldDeload).toBe(false);
  });

  it("counts low recovery and missed sessions", () => {
    const result = assessDeloadNeed({
      stalledLifts: 0,
      rpeCreep: 0,
      musclesOverMrv: 2, // 25
      readinessScore: 40, // 20
      missedSessions: 2, // 10
    });
    expect(result.score).toBe(55);
    expect(result.shouldDeload).toBe(true);
  });

  it("does not recommend a deload during one", () => {
    const result = assessDeloadNeed(
      { stalledLifts: 3, rpeCreep: 1, musclesOverMrv: 3, missedSessions: 3 },
      "deload",
    );
    expect(result.shouldDeload).toBe(false);
    expect(result.score).toBe(0);
  });
});

describe("buildFatigueSignals", () => {
  it("derives stalls and RPE creep from logs", () => {
    const stalledLogs = [
      { ...log("2026-06-01", "Squat", 0), weightLbs: 300 },
      { ...log("2026-06-08", "Squat", 0), weightLbs: 290 },
      { ...log("2026-06-15", "Squat", 0), weightLbs: 290 },
      { ...log("2026-06-22", "Squat", 0), weightLbs: 285 },
    ];
    const signals = buildFatigueSignals({
      progressions: [buildExerciseProgression(stalledLogs, "Squat")],
      setLogs: stalledLogs,
      musclesOverMrv: 1,
      readinessScore: 55,
      missedSessions: 1,
      today: "2026-06-23",
    });

    expect(signals.stalledLifts).toBe(1);
    expect(signals.musclesOverMrv).toBe(1);
    expect(signals.readinessScore).toBe(55);
    expect(signals.missedSessions).toBe(1);
  });
});

describe("resolveMesocycle", () => {
  it("follows the schedule when fatigue is low", () => {
    const { state, deloadForced } = resolveMesocycle({
      programWeek: 2,
      blockLength: 5,
      signals: noFatigue,
    });
    expect(state.phase).toBe("accumulation");
    expect(deloadForced).toBe(false);
  });

  it("pulls the deload forward when the body asks for it", () => {
    const { state, deload, deloadForced } = resolveMesocycle({
      programWeek: 2,
      blockLength: 5,
      signals: { stalledLifts: 2, rpeCreep: 0.6, musclesOverMrv: 1, missedSessions: 0 },
    });

    expect(deloadForced).toBe(true);
    expect(state.phase).toBe("deload");
    expect(state.volumeMultiplier).toBe(0.5);
    expect(state.summary).toContain("Early deload");
    expect(deload.urgency).toBe("now");
  });

  it("works without any fatigue signals", () => {
    const { state, deload } = resolveMesocycle({ programWeek: 5, blockLength: 5 });
    expect(state.phase).toBe("deload");
    expect(deload.urgency).toBe("none");
  });
});

describe("mesocycle drives the prescription", () => {
  const bench: WorkoutExercise = { name: "Bench Press", sets: "4", reps: "8-12" };
  const history = [
    { ...log("2026-07-01", "Bench Press", 0, 7), reps: 12, weightLbs: 200 },
  ];

  it("halves sets and drops load during a deload week", () => {
    const progression = buildExerciseProgression(history, "Bench Press");
    const deloadWeek = mesocycleStateForWeek(5, 5);

    const normal = prescribeNextSession(bench, progression);
    const deloaded = prescribeNextSession(bench, progression, {
      volumeMultiplier: deloadWeek.volumeMultiplier,
      intensityMultiplier: deloadWeek.intensityMultiplier,
    });

    expect(normal.targetSets).toBe(4);
    expect(deloaded.targetSets).toBe(2);
    expect(deloaded.targetWeightLbs!).toBeLessThan(normal.targetWeightLbs!);
  });

  it("never scales below a single working set", () => {
    const single: WorkoutExercise = { name: "Bench Press", sets: "1", reps: "8-12" };
    const rx = prescribeNextSession(single, undefined, { volumeMultiplier: 0.5 });
    expect(rx.targetSets).toBe(1);
  });
});

describe("phaseLabel", () => {
  it("labels every phase", () => {
    expect(phaseLabel("accumulation")).toBe("Accumulation");
    expect(phaseLabel("peak")).toBe("Peak");
    expect(phaseLabel("deload")).toBe("Deload");
  });
});

describe("hasCompletedDeloadWeek", () => {
  // Block length 5 anchored at 2026-05-04 → week 5 starts 2026-06-01.
  const anchor = "2026-05-04";

  it("counts a deload week that was trained through", () => {
    expect(hasCompletedDeloadWeek(anchor, 7, new Set(["2026-06-01"]), 5)).toBe(true);
  });

  it("does not count a deload week that was skipped", () => {
    expect(hasCompletedDeloadWeek(anchor, 7, new Set(["2026-05-11", "2026-06-08"]), 5)).toBe(false);
  });

  it("does not count a deload week still in progress", () => {
    // Program week 5 is the deload; it is not behind them yet.
    expect(hasCompletedDeloadWeek(anchor, 5, new Set(["2026-06-01"]), 5)).toBe(false);
  });

  it("finds a deload in any completed block", () => {
    // Second block's deload week starts 2026-07-06 (program week 10).
    expect(hasCompletedDeloadWeek(anchor, 12, new Set(["2026-07-06"]), 5)).toBe(true);
  });
});
