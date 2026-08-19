/**
 * Deterministic progressive-overload engine.
 *
 * Turns logged sets (weight/reps/RPE) into a strength trend per exercise and a
 * concrete prescription for the next session — "squat 195 x 5" rather than
 * "try to go a bit heavier". No model calls: every output here is reproducible
 * math so the coach explains numbers instead of inventing them.
 *
 * Mirrored on iOS (`RefactorKit/Sources/Utilities/Progression.swift`) and
 * Android (`api/Progression.kt`). Keep the three in sync.
 */

import type { WorkoutExercise, WorkoutSetLog } from "./types";

// ── Tunables ────────────────────────────────────────────

/** Reps beyond this make e1RM estimates unreliable; we flag low confidence. */
const MAX_RELIABLE_REPS = 12;
/** RPE at or below this on a top set means there was room to spare → earn load. */
const OVERLOAD_RPE_CEILING = 8;
/** RPE at or above this means the set was a grind → hold rather than push. */
const GRIND_RPE = 9.5;
/** Sessions without an e1RM improvement before we call it a stall. */
const STALL_SESSION_THRESHOLD = 3;
/** Load cut applied when deloading a stalled lift. */
const DELOAD_FRACTION = 0.9;
/** Readiness score below this suppresses load increases. */
const LOW_READINESS = 60;

// ── Types ───────────────────────────────────────────────

export interface RepRange {
  min: number;
  max: number;
}

export interface ExerciseSessionPoint {
  date: string;
  /** Best estimated 1RM across all sets logged that session. */
  bestE1rm: number;
  topSetWeightLbs?: number;
  topSetReps?: number;
  topSetRpe?: number;
  totalVolumeLbs: number;
  workingSets: number;
}

export type ProgressionTrend = "climbing" | "flat" | "declining" | "insufficient_data";

export interface ExerciseProgression {
  exerciseName: string;
  /** Chronological, one entry per session that produced a usable e1RM. */
  sessions: ExerciseSessionPoint[];
  currentE1rm: number;
  bestE1rm: number;
  bestE1rmDate?: string;
  /** Percent change from the earliest session in the window to the latest. */
  changePct: number;
  trend: ProgressionTrend;
  /** Sessions logged since the all-time best — the stall counter. */
  sessionsSinceBest: number;
  stalled: boolean;
}

export type PrescriptionAction =
  | "establish_baseline"
  | "add_load"
  | "add_reps"
  | "hold"
  | "deload";

export interface SetPrescription {
  exerciseName: string;
  action: PrescriptionAction;
  targetSets: number;
  targetReps: number;
  targetRepsMax?: number;
  targetWeightLbs?: number;
  targetRpe?: number;
  /** Human-readable "why", shown in the UI and handed to the coach verbatim. */
  rationale: string;
  confidence: "high" | "medium" | "low";
  previous?: {
    date: string;
    weightLbs?: number;
    reps?: number;
    rpe?: number;
  };
}

export interface PrescriptionOptions {
  /** 0-100 recovery score; low readiness suppresses load jumps. */
  readinessScore?: number;
  /** Multiplier on prescribed load, e.g. 0.9 during a deload week. From `mesocycle.ts`. */
  intensityMultiplier?: number;
  /** Multiplier on prescribed sets, e.g. 0.5 during a deload week. From `mesocycle.ts`. */
  volumeMultiplier?: number;
  today?: string;
}

// ── e1RM ────────────────────────────────────────────────

/**
 * Epley estimated 1RM, RIR-adjusted when RPE is known.
 *
 * A set of 8 @ RPE 8 had ~2 reps in reserve, so it reflects the same strength
 * as a set of 10 taken to failure. Folding that in makes submaximal work
 * comparable across sessions — the whole point of autoregulation.
 */
export function estimateOneRepMax(weightLbs: number, reps: number, rpe?: number): number {
  if (!(weightLbs > 0) || !(reps > 0)) return 0;
  const repsInReserve = rpe != null && rpe > 0 && rpe <= 10 ? Math.max(0, 10 - rpe) : 0;
  const effectiveReps = reps + repsInReserve;
  return weightLbs * (1 + effectiveReps / 30);
}

/** Load that should permit `reps` at the given e1RM (inverse Epley). */
export function loadForReps(e1rm: number, reps: number): number {
  if (!(e1rm > 0) || !(reps > 0)) return 0;
  return e1rm / (1 + reps / 30);
}

// ── Parsing prescribed sets/reps ────────────────────────

/** "8-12" → {min:8,max:12}; "10" → {min:10,max:10}. Null for time/AMRAP work. */
export function parseRepRange(reps: string | undefined): RepRange | null {
  if (!reps) return null;
  const cleaned = reps.toLowerCase();
  if (/sec|min|amrap|max|failure/.test(cleaned)) return null;
  const nums = cleaned.match(/\d+/g);
  if (!nums || nums.length === 0) return null;
  const min = parseInt(nums[0], 10);
  const max = nums.length > 1 ? parseInt(nums[1], 10) : min;
  if (!Number.isFinite(min) || min <= 0) return null;
  return { min, max: Math.max(min, max) };
}

/** "3-4 sets" / "4" → 4. Defaults to 3 when unparseable. */
export function parseSetTarget(sets: string | undefined): number {
  if (!sets) return 3;
  const nums = sets.match(/\d+/g);
  if (!nums) return 3;
  const last = parseInt(nums[nums.length - 1], 10);
  return Number.isFinite(last) ? Math.min(Math.max(last, 1), 10) : 3;
}

// ── Load increments ─────────────────────────────────────

const LOWER_BODY_PATTERN =
  /squat|deadlift|leg press|hip thrust|lunge|romanian|rdl|hack|good morning|split squat|step[- ]?up|calf/i;
const DUMBBELL_PATTERN = /dumbbell|db |kettlebell|kb /i;
const ISOLATION_PATTERN =
  /curl|raise|fly|flye|extension|pushdown|pullover|shrug|face pull|rear delt|kickback/i;

/**
 * Smallest sensible jump for this lift. Big compound lower-body movements
 * absorb 10 lb; isolation work stalls out if you add more than 2.5.
 */
export function loadIncrementLbs(exerciseName: string): number {
  const name = exerciseName.toLowerCase();
  if (ISOLATION_PATTERN.test(name)) return 2.5;
  if (DUMBBELL_PATTERN.test(name)) return 5;
  if (LOWER_BODY_PATTERN.test(name)) return 10;
  return 5;
}

/** Round to a loadable weight (2.5 lb granularity on the smallest jumps). */
export function roundToLoadable(weightLbs: number, incrementLbs: number): number {
  const granularity = incrementLbs <= 2.5 ? 2.5 : 5;
  return Math.round(weightLbs / granularity) * granularity;
}

// ── Building the trend ──────────────────────────────────

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/** Collapse one exercise's logs into one point per session, keyed by date. */
export function buildExerciseProgression(
  logs: WorkoutSetLog[],
  exerciseName: string,
): ExerciseProgression {
  const key = normalizeName(exerciseName);
  const relevant = logs.filter(
    (l) => normalizeName(l.exerciseName) === key && l.section !== "warmup",
  );

  const byDate = new Map<string, WorkoutSetLog[]>();
  for (const log of relevant) {
    const arr = byDate.get(log.date) ?? [];
    arr.push(log);
    byDate.set(log.date, arr);
  }

  const sessions: ExerciseSessionPoint[] = [];
  for (const [date, dayLogs] of byDate) {
    let bestE1rm = 0;
    let topWeight: number | undefined;
    let topReps: number | undefined;
    let topRpe: number | undefined;
    let volume = 0;
    let workingSets = 0;

    for (const log of dayLogs) {
      if (log.weightLbs == null || log.reps == null) continue;
      workingSets += 1;
      volume += log.weightLbs * log.reps;
      const e1rm = estimateOneRepMax(log.weightLbs, log.reps, log.rpe);
      if (e1rm > bestE1rm) {
        bestE1rm = e1rm;
        topWeight = log.weightLbs;
        topReps = log.reps;
        topRpe = log.rpe;
      }
    }

    if (bestE1rm <= 0) continue;
    sessions.push({
      date,
      bestE1rm: Math.round(bestE1rm * 10) / 10,
      topSetWeightLbs: topWeight,
      topSetReps: topReps,
      topSetRpe: topRpe,
      totalVolumeLbs: Math.round(volume),
      workingSets,
    });
  }

  sessions.sort((a, b) => a.date.localeCompare(b.date));

  if (sessions.length === 0) {
    return {
      exerciseName,
      sessions: [],
      currentE1rm: 0,
      bestE1rm: 0,
      changePct: 0,
      trend: "insufficient_data",
      sessionsSinceBest: 0,
      stalled: false,
    };
  }

  const currentE1rm = sessions[sessions.length - 1].bestE1rm;
  let bestE1rm = 0;
  let bestIndex = 0;
  sessions.forEach((s, i) => {
    if (s.bestE1rm > bestE1rm) {
      bestE1rm = s.bestE1rm;
      bestIndex = i;
    }
  });

  const first = sessions[0].bestE1rm;
  const changePct = first > 0 ? ((currentE1rm - first) / first) * 100 : 0;
  const sessionsSinceBest = sessions.length - 1 - bestIndex;

  let trend: ProgressionTrend;
  if (sessions.length < 2) trend = "insufficient_data";
  else if (changePct >= 2) trend = "climbing";
  else if (changePct <= -3) trend = "declining";
  else trend = "flat";

  return {
    exerciseName: sessions.length ? relevant[0].exerciseName : exerciseName,
    sessions,
    currentE1rm,
    bestE1rm,
    bestE1rmDate: sessions[bestIndex]?.date,
    changePct: Math.round(changePct * 10) / 10,
    trend,
    sessionsSinceBest,
    stalled: sessionsSinceBest >= STALL_SESSION_THRESHOLD,
  };
}

/** One progression per distinct non-warmup exercise present in the logs. */
export function buildAllProgressions(logs: WorkoutSetLog[]): ExerciseProgression[] {
  const names = new Map<string, string>();
  for (const log of logs) {
    if (log.section === "warmup") continue;
    const key = normalizeName(log.exerciseName);
    if (key && !names.has(key)) names.set(key, log.exerciseName);
  }
  return Array.from(names.values())
    .map((name) => buildExerciseProgression(logs, name))
    .filter((p) => p.sessions.length > 0)
    .sort((a, b) => b.currentE1rm - a.currentE1rm);
}

// ── Prescription ────────────────────────────────────────

function describeWeight(weight: number): string {
  return Number.isInteger(weight) ? `${weight}` : `${weight.toFixed(1)}`;
}

/**
 * Double progression with RPE autoregulation.
 *
 * Hit the top of the rep range with reps to spare → add load and reset to the
 * bottom of the range. Otherwise add a rep. Grind sets hold, stalls deload.
 */
export function prescribeNextSession(
  exercise: WorkoutExercise,
  progression: ExerciseProgression | undefined,
  options: PrescriptionOptions = {},
): SetPrescription {
  const range = parseRepRange(exercise.reps);
  const intensityMultiplier = options.intensityMultiplier ?? 1;
  const volumeMultiplier = options.volumeMultiplier ?? 1;
  const readiness = options.readinessScore;
  // Never scale below one working set — a deload is less work, not no work.
  const targetSets =
    volumeMultiplier === 1
      ? parseSetTarget(exercise.sets)
      : Math.max(1, Math.round(parseSetTarget(exercise.sets) * volumeMultiplier));

  // Bodyweight / timed work has no load to prescribe.
  if (!range) {
    return {
      exerciseName: exercise.name,
      action: "hold",
      targetSets,
      targetReps: 0,
      rationale: `Perform as prescribed (${exercise.reps ?? "as written"}).`,
      confidence: "low",
    };
  }

  const last = progression?.sessions[progression.sessions.length - 1];

  if (!progression || !last || last.topSetWeightLbs == null) {
    return {
      exerciseName: exercise.name,
      action: "establish_baseline",
      targetSets,
      targetReps: range.min,
      targetRepsMax: range.max,
      targetRpe: OVERLOAD_RPE_CEILING,
      rationale: `First tracked session — pick a weight you can take to ${range.max} reps at RPE ${OVERLOAD_RPE_CEILING}, then log it. That becomes your baseline.`,
      confidence: "low",
    };
  }

  const lastWeight = last.topSetWeightLbs;
  const lastReps = last.topSetReps ?? 0;
  const lastRpe = last.topSetRpe;
  const increment = loadIncrementLbs(exercise.name);
  const previous = {
    date: last.date,
    weightLbs: lastWeight,
    reps: lastReps,
    rpe: lastRpe,
  };
  const confidence: SetPrescription["confidence"] =
    lastReps > MAX_RELIABLE_REPS
      ? "low"
      : progression.sessions.length >= 3
        ? "high"
        : "medium";

  const applyMultiplier = (w: number) =>
    intensityMultiplier === 1 ? w : roundToLoadable(w * intensityMultiplier, increment);

  // 1. Stalled → deload to break the plateau.
  if (progression.stalled) {
    const target = roundToLoadable(lastWeight * DELOAD_FRACTION, increment);
    return {
      exerciseName: exercise.name,
      action: "deload",
      targetSets,
      targetReps: range.min,
      targetRepsMax: range.max,
      targetWeightLbs: applyMultiplier(target),
      targetRpe: 7,
      rationale: `No e1RM progress in ${progression.sessionsSinceBest} sessions. Drop to ${describeWeight(target)} lb (−10%) and rebuild — plateaus break by backing off, not grinding.`,
      confidence,
      previous,
    };
  }

  // 2. Low readiness → hold load, keep the session productive but not costly.
  if (readiness != null && readiness < LOW_READINESS) {
    return {
      exerciseName: exercise.name,
      action: "hold",
      targetSets,
      targetReps: range.min,
      targetRepsMax: range.max,
      targetWeightLbs: applyMultiplier(lastWeight),
      targetRpe: 7,
      rationale: `Recovery is at ${Math.round(readiness)}/100. Repeat ${describeWeight(lastWeight)} lb and stop 2 reps shy — hold ground today, push when you're recovered.`,
      confidence,
      previous,
    };
  }

  // 3. Last set was a grind → repeat it before adding anything.
  if (lastRpe != null && lastRpe >= GRIND_RPE && lastReps < range.max) {
    return {
      exerciseName: exercise.name,
      action: "hold",
      targetSets,
      targetReps: Math.min(lastReps + 1, range.max),
      targetRepsMax: range.max,
      targetWeightLbs: applyMultiplier(lastWeight),
      targetRpe: OVERLOAD_RPE_CEILING + 1,
      rationale: `Last set hit RPE ${lastRpe}. Stay at ${describeWeight(lastWeight)} lb until it moves cleaner, then add load.`,
      confidence,
      previous,
    };
  }

  // 4. Topped out the rep range with reps to spare → add load, reset reps.
  const earnedLoad =
    lastReps >= range.max && (lastRpe == null || lastRpe <= OVERLOAD_RPE_CEILING);
  if (earnedLoad) {
    const target = roundToLoadable(lastWeight + increment, increment);
    return {
      exerciseName: exercise.name,
      action: "add_load",
      targetSets,
      targetReps: range.min,
      targetRepsMax: range.max,
      targetWeightLbs: applyMultiplier(target),
      targetRpe: OVERLOAD_RPE_CEILING,
      rationale: `You hit ${lastReps} reps at ${describeWeight(lastWeight)} lb${lastRpe != null ? ` (RPE ${lastRpe})` : ""} — that earned the jump. Go ${describeWeight(target)} lb for ${range.min} and climb back up the range.`,
      confidence,
      previous,
    };
  }

  // 5. Otherwise add a rep at the same load.
  const nextReps = Math.min(lastReps + 1, range.max);
  return {
    exerciseName: exercise.name,
    action: "add_reps",
    targetSets,
    targetReps: nextReps,
    targetRepsMax: range.max,
    targetWeightLbs: applyMultiplier(lastWeight),
    targetRpe: OVERLOAD_RPE_CEILING,
    rationale: `Last time: ${describeWeight(lastWeight)} lb × ${lastReps}. Same weight, chase ${nextReps} reps. At ${range.max} you earn the next jump.`,
    confidence,
    previous,
  };
}

/** Prescriptions for every main/finisher movement in a day. */
export function prescribeWorkoutDay(
  exercises: WorkoutExercise[],
  logs: WorkoutSetLog[],
  options: PrescriptionOptions = {},
): SetPrescription[] {
  return exercises.map((exercise) =>
    prescribeNextSession(exercise, buildExerciseProgression(logs, exercise.name), options),
  );
}

// ── Coach-facing summary ────────────────────────────────

export interface ProgressionSummary {
  trackedExercises: number;
  climbing: string[];
  stalled: string[];
  /** Biggest e1RM gainers, formatted for display. */
  topGains: { exerciseName: string; changePct: number; currentE1rm: number }[];
  /** Newly set e1RM records within the lookback window. */
  recentPrs: { exerciseName: string; e1rm: number; date: string }[];
}

export function summarizeProgressions(
  progressions: ExerciseProgression[],
  recentDays = 14,
  today?: string,
): ProgressionSummary {
  const todayStr = today ?? new Date().toISOString().slice(0, 10);
  const cutoff = new Date(todayStr + "T12:00:00");
  cutoff.setDate(cutoff.getDate() - recentDays);

  const climbing: string[] = [];
  const stalled: string[] = [];
  const recentPrs: ProgressionSummary["recentPrs"] = [];

  for (const p of progressions) {
    if (p.trend === "climbing") climbing.push(p.exerciseName);
    if (p.stalled) stalled.push(p.exerciseName);
    if (p.bestE1rmDate && new Date(p.bestE1rmDate + "T12:00:00") >= cutoff && p.sessions.length > 1) {
      recentPrs.push({
        exerciseName: p.exerciseName,
        e1rm: Math.round(p.bestE1rm),
        date: p.bestE1rmDate,
      });
    }
  }

  const topGains = [...progressions]
    .filter((p) => p.sessions.length >= 2)
    .sort((a, b) => b.changePct - a.changePct)
    .slice(0, 5)
    .map((p) => ({
      exerciseName: p.exerciseName,
      changePct: p.changePct,
      currentE1rm: Math.round(p.currentE1rm),
    }));

  return {
    trackedExercises: progressions.length,
    climbing,
    stalled,
    topGains,
    recentPrs: recentPrs.sort((a, b) => b.date.localeCompare(a.date)),
  };
}
