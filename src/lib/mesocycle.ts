/**
 * Mesocycle periodization and fatigue-driven deloads.
 *
 * A 12-week program that repeats week 1 twelve times is where transformations stall around
 * week five: volume never ramps, fatigue never gets cleared, and the lifter grinds until
 * something hurts. This module gives the program a shape — volume climbing across a block,
 * a peak week, then a deload — and watches real fatigue signals so the deload can arrive
 * early when the body asks for it.
 *
 * Consumes `progression.ts` (stalls, RPE) and `muscle-volume.ts` (sets past MRV).
 * Mirrored on iOS (`Mesocycle.swift`) and Android (`api/Mesocycle.kt`).
 */

import type { WorkoutSetLog } from "./types";
import type { ExerciseProgression } from "./progression";

// ── Tunables ────────────────────────────────────────────

/** Weeks per block, including the trailing deload. */
export const DEFAULT_BLOCK_LENGTH = 5;
export const MIN_BLOCK_LENGTH = 3;
export const MAX_BLOCK_LENGTH = 8;

/** Volume ramp across accumulation weeks. */
const RAMP_START = 0.85;
const RAMP_END = 1.15;
/** Peak week: volume backs off slightly so intensity can rise. */
const PEAK_VOLUME = 1.0;
const PEAK_INTENSITY = 1.03;
/** Deload: half the work at 90% of the load. */
const DELOAD_VOLUME = 0.5;
const DELOAD_INTENSITY = 0.9;

/** Fatigue score at or above this means deload now. */
const DELOAD_NOW_SCORE = 50;
/** Below `now` but at or above this means deload is coming. */
const DELOAD_SOON_SCORE = 30;

// ── Types ───────────────────────────────────────────────

export type MesocyclePhase = "accumulation" | "peak" | "deload";

export interface MesocycleState {
  /** 1-based week within the current block. */
  weekInBlock: number;
  blockLength: number;
  /** 1-based block number since the program started. */
  blockNumber: number;
  phase: MesocyclePhase;
  /** Multiplier on prescribed sets this week. */
  volumeMultiplier: number;
  /** Multiplier on prescribed load this week. Feeds `PrescriptionOptions.intensityMultiplier`. */
  intensityMultiplier: number;
  /** One-line explanation for the UI and the coach. */
  summary: string;
}

export interface FatigueSignals {
  /** Lifts with no e1RM progress for 3+ sessions. */
  stalledLifts: number;
  /** Change in average top-set RPE, recent window vs the one before it. */
  rpeCreep: number;
  /** Muscle groups logged past their maximum recoverable volume. */
  musclesOverMrv: number;
  /** 0-100 recovery score, when a wearable supplies one. */
  readinessScore?: number;
  /** Sessions missed in the last 7 days. */
  missedSessions: number;
}

export type DeloadUrgency = "none" | "soon" | "now";

export interface DeloadRecommendation {
  shouldDeload: boolean;
  urgency: DeloadUrgency;
  /** Weighted fatigue score, 0-100. */
  score: number;
  /** Plain-language reasons, most significant first. */
  reasons: string[];
}

// ── Block position ──────────────────────────────────────

export function clampBlockLength(weeks: unknown): number {
  const n = typeof weeks === "number" && Number.isFinite(weeks) ? Math.round(weeks) : DEFAULT_BLOCK_LENGTH;
  return Math.min(MAX_BLOCK_LENGTH, Math.max(MIN_BLOCK_LENGTH, n));
}

/**
 * Where a given program week sits inside its block.
 * `programWeek` is 1-based and continuous across the whole program.
 */
export function blockPosition(
  programWeek: number,
  blockLength = DEFAULT_BLOCK_LENGTH,
): { weekInBlock: number; blockNumber: number } {
  const length = clampBlockLength(blockLength);
  const week = Math.max(1, Math.round(programWeek));
  const zeroBased = week - 1;
  return {
    weekInBlock: (zeroBased % length) + 1,
    blockNumber: Math.floor(zeroBased / length) + 1,
  };
}

/**
 * The training shape for a week: accumulation weeks ramp volume, the second-to-last week
 * peaks intensity, and the final week deloads to clear accumulated fatigue.
 */
export function mesocycleStateForWeek(
  programWeek: number,
  blockLength = DEFAULT_BLOCK_LENGTH,
): MesocycleState {
  const length = clampBlockLength(blockLength);
  const { weekInBlock, blockNumber } = blockPosition(programWeek, length);

  if (weekInBlock === length) {
    return {
      weekInBlock,
      blockLength: length,
      blockNumber,
      phase: "deload",
      volumeMultiplier: DELOAD_VOLUME,
      intensityMultiplier: DELOAD_INTENSITY,
      summary: `Deload week — half the sets at 90% load. This is where the last ${length - 1} weeks turn into adaptation.`,
    };
  }

  // Peak week only exists in blocks long enough to have built something worth peaking.
  const isPeak = length >= 4 && weekInBlock === length - 1;
  if (isPeak) {
    return {
      weekInBlock,
      blockLength: length,
      blockNumber,
      phase: "peak",
      volumeMultiplier: PEAK_VOLUME,
      intensityMultiplier: PEAK_INTENSITY,
      summary: "Peak week — volume eases back so you can push the heaviest loads of the block.",
    };
  }

  // Ramp across the accumulation weeks that precede the peak.
  const accumulationWeeks = Math.max(1, length - (length >= 4 ? 2 : 1));
  const step = accumulationWeeks > 1 ? (RAMP_END - RAMP_START) / (accumulationWeeks - 1) : 0;
  const volumeMultiplier = Math.round((RAMP_START + step * (weekInBlock - 1)) * 100) / 100;

  return {
    weekInBlock,
    blockLength: length,
    blockNumber,
    phase: "accumulation",
    volumeMultiplier,
    intensityMultiplier: 1,
    summary: `Accumulation week ${weekInBlock} of ${length} — volume climbing toward the peak.`,
  };
}

// ── Fatigue detection ───────────────────────────────────

/**
 * Change in average top-set RPE between the two most recent windows.
 *
 * Rising RPE at the same loads is the earliest honest signal that fatigue is outpacing
 * recovery — it shows up before the bar speed drops and well before a lift stalls outright.
 */
export function rpeCreep(
  setLogs: WorkoutSetLog[],
  windowDays = 7,
  today = new Date().toISOString().slice(0, 10),
): number {
  const end = new Date(today + "T12:00:00");
  const midpoint = new Date(end);
  midpoint.setDate(midpoint.getDate() - windowDays);
  const start = new Date(end);
  start.setDate(start.getDate() - windowDays * 2);

  const recent: number[] = [];
  const prior: number[] = [];

  for (const log of setLogs) {
    if (log.section === "warmup" || log.rpe == null) continue;
    const date = new Date(log.date + "T12:00:00");
    if (date > end) continue;
    if (date > midpoint) recent.push(log.rpe);
    else if (date > start) prior.push(log.rpe);
  }

  if (recent.length === 0 || prior.length === 0) return 0;
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  return Math.round((mean(recent) - mean(prior)) * 100) / 100;
}

/** Gather the signals a deload decision rests on. */
export function buildFatigueSignals(input: {
  progressions: ExerciseProgression[];
  setLogs: WorkoutSetLog[];
  musclesOverMrv?: number;
  readinessScore?: number;
  missedSessions?: number;
  today?: string;
}): FatigueSignals {
  return {
    stalledLifts: input.progressions.filter((p) => p.stalled).length,
    rpeCreep: rpeCreep(input.setLogs, 7, input.today),
    musclesOverMrv: input.musclesOverMrv ?? 0,
    readinessScore: input.readinessScore,
    missedSessions: input.missedSessions ?? 0,
  };
}

/**
 * Score accumulated fatigue and decide whether the block should end early.
 *
 * No single signal is trusted on its own — one stalled lift is noise, but a stalled lift
 * plus rising RPE plus a group past MRV is a block that has run its course.
 */
export function assessDeloadNeed(
  signals: FatigueSignals,
  currentPhase?: MesocyclePhase,
): DeloadRecommendation {
  // Already deloading — nothing to recommend.
  if (currentPhase === "deload") {
    return {
      shouldDeload: false,
      urgency: "none",
      score: 0,
      reasons: ["Already in a deload week."],
    };
  }

  let score = 0;
  const reasons: string[] = [];

  if (signals.stalledLifts >= 2) {
    score += 30;
    reasons.push(`${signals.stalledLifts} lifts have stopped progressing.`);
  } else if (signals.stalledLifts === 1) {
    score += 12;
    reasons.push("One lift has stopped progressing.");
  }

  if (signals.rpeCreep >= 0.5) {
    score += 25;
    reasons.push(`Same loads are feeling ${signals.rpeCreep.toFixed(1)} RPE harder than last week.`);
  } else if (signals.rpeCreep >= 0.25) {
    score += 12;
    reasons.push("Sessions are starting to feel harder at the same loads.");
  }

  if (signals.musclesOverMrv >= 2) {
    score += 25;
    reasons.push(`${signals.musclesOverMrv} muscle groups are past their recoverable volume.`);
  } else if (signals.musclesOverMrv === 1) {
    score += 15;
    reasons.push("One muscle group is past its recoverable volume.");
  }

  if (signals.readinessScore != null && signals.readinessScore < 50) {
    score += 20;
    reasons.push(`Recovery is running low (${Math.round(signals.readinessScore)}/100).`);
  } else if (signals.readinessScore != null && signals.readinessScore < 65) {
    score += 10;
    reasons.push("Recovery has been below par.");
  }

  if (signals.missedSessions >= 2) {
    score += 10;
    reasons.push(`${signals.missedSessions} sessions missed this week.`);
  }

  score = Math.min(100, score);
  const urgency: DeloadUrgency =
    score >= DELOAD_NOW_SCORE ? "now" : score >= DELOAD_SOON_SCORE ? "soon" : "none";

  return {
    shouldDeload: urgency === "now",
    urgency,
    score,
    reasons,
  };
}

/**
 * The week's plan, with an early deload substituted when fatigue demands one.
 * This is the single call the UI and coach should use.
 */
export function resolveMesocycle(input: {
  programWeek: number;
  blockLength?: number;
  signals?: FatigueSignals;
}): { state: MesocycleState; deload: DeloadRecommendation; deloadForced: boolean } {
  const scheduled = mesocycleStateForWeek(input.programWeek, input.blockLength);
  const deload = input.signals
    ? assessDeloadNeed(input.signals, scheduled.phase)
    : { shouldDeload: false, urgency: "none" as DeloadUrgency, score: 0, reasons: [] };

  if (!deload.shouldDeload) {
    return { state: scheduled, deload, deloadForced: false };
  }

  return {
    state: {
      ...scheduled,
      phase: "deload",
      volumeMultiplier: DELOAD_VOLUME,
      intensityMultiplier: DELOAD_INTENSITY,
      summary: `Early deload — fatigue signals say this block is done. ${deload.reasons[0] ?? ""}`.trim(),
    },
    deload,
    deloadForced: true,
  };
}

/**
 * Whether the lifter has actually trained through a deload week.
 *
 * A deload only counts once it is behind them and they logged work during it — skipping the
 * week entirely is not the same as executing a planned back-off, and the badge should not
 * reward absence.
 */
export function hasCompletedDeloadWeek(
  anchorWeekStart: string,
  programWeekNow: number,
  loggedWeekStarts: Set<string>,
  blockLength = DEFAULT_BLOCK_LENGTH,
): boolean {
  const length = clampBlockLength(blockLength);
  const anchor = new Date(anchorWeekStart + "T12:00:00");

  // Deload weeks sit at every multiple of the block length.
  for (let week = length; week < programWeekNow; week += length) {
    const weekStart = new Date(anchor);
    weekStart.setDate(weekStart.getDate() + (week - 1) * 7);
    if (loggedWeekStarts.has(weekStart.toISOString().slice(0, 10))) return true;
  }
  return false;
}

/** Display label for a phase. */
export function phaseLabel(phase: MesocyclePhase): string {
  switch (phase) {
    case "accumulation":
      return "Accumulation";
    case "peak":
      return "Peak";
    case "deload":
      return "Deload";
  }
}
