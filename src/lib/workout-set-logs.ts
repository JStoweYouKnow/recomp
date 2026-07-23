/**
 * Per-set workout performance logs (weight, reps, RPE).
 */

import type { WorkoutExercise, WorkoutSetLog } from "./types";

export type WorkoutSetSection = WorkoutSetLog["section"];

export function parseSetCount(sets: string): number {
  const m = sets.match(/\d+/);
  if (!m) return 1;
  return Math.min(Math.max(parseInt(m[0], 10), 1), 20);
}

export function workoutSetLogId(params: {
  planId: string;
  date: string;
  dayLabel: string;
  section: WorkoutSetSection;
  exerciseName: string;
  globalSlot: number;
  setIndex: number;
}): string {
  const name = params.exerciseName.trim().toLowerCase();
  return `${params.planId}:${params.date}:${params.dayLabel}:${params.section}:${name}:${params.globalSlot}:set_${params.setIndex}`;
}

export function buildWorkoutSetLog(params: {
  planId: string;
  date: string;
  dayLabel: string;
  section: WorkoutSetSection;
  exercise: WorkoutExercise;
  globalSlot: number;
  setIndex: number;
  weightLbs?: number;
  reps?: number;
  rpe?: number;
}): WorkoutSetLog {
  const id = workoutSetLogId({
    planId: params.planId,
    date: params.date,
    dayLabel: params.dayLabel,
    section: params.section,
    exerciseName: params.exercise.name,
    globalSlot: params.globalSlot,
    setIndex: params.setIndex,
  });
  return {
    id,
    date: params.date,
    planId: params.planId,
    dayLabel: params.dayLabel,
    section: params.section,
    exerciseName: params.exercise.name.trim(),
    globalSlot: params.globalSlot,
    setIndex: params.setIndex,
    weightLbs: params.weightLbs,
    reps: params.reps,
    rpe: params.rpe,
    prescribedSets: params.exercise.sets,
    prescribedReps: params.exercise.reps,
    loggedAt: new Date().toISOString(),
  };
}

export function upsertWorkoutSetLog(logs: WorkoutSetLog[], entry: WorkoutSetLog): WorkoutSetLog[] {
  const idx = logs.findIndex((l) => l.id === entry.id);
  if (idx >= 0) {
    const next = [...logs];
    next[idx] = entry;
    return next;
  }
  return [...logs, entry];
}

export function removeWorkoutSetLog(logs: WorkoutSetLog[], id: string): WorkoutSetLog[] {
  return logs.filter((l) => l.id !== id);
}

export function mergeWorkoutSetLogs(local: WorkoutSetLog[], remote: WorkoutSetLog[]): WorkoutSetLog[] {
  const byId = new Map<string, WorkoutSetLog>();
  for (const log of remote) byId.set(log.id, log);
  for (const log of local) {
    const existing = byId.get(log.id);
    if (!existing || log.loggedAt >= existing.loggedAt) byId.set(log.id, log);
  }
  return Array.from(byId.values()).sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
}

export function logsForExerciseOnDate(
  logs: WorkoutSetLog[],
  planId: string,
  date: string,
  dayLabel: string,
  section: WorkoutSetSection,
  exerciseName: string,
  globalSlot: number,
): WorkoutSetLog[] {
  const name = exerciseName.trim().toLowerCase();
  return logs
    .filter(
      (l) =>
        l.planId === planId &&
        l.date === date &&
        l.dayLabel === dayLabel &&
        l.section === section &&
        l.exerciseName.trim().toLowerCase() === name &&
        l.globalSlot === globalSlot,
    )
    .sort((a, b) => a.setIndex - b.setIndex);
}

export interface ExercisePerformanceHighlight {
  exerciseName: string;
  lastDate?: string;
  lastSets: { weightLbs?: number; reps?: number; rpe?: number }[];
  bestWeightLbs?: number;
  totalVolumeLbs?: number;
}

export interface WorkoutPerformanceSummary {
  recentHighlights: ExercisePerformanceHighlight[];
  lastSessionVolumeLbs?: number;
}

export function buildWorkoutPerformanceSummary(
  logs: WorkoutSetLog[],
  lookbackDays = 28,
  today?: string,
): WorkoutPerformanceSummary {
  const todayStr = today ?? new Date().toISOString().slice(0, 10);
  const cutoff = new Date(todayStr + "T12:00:00");
  cutoff.setDate(cutoff.getDate() - lookbackDays);

  const recent = logs.filter((l) => {
    const d = new Date(l.date + "T12:00:00");
    return d >= cutoff && (l.weightLbs != null || l.reps != null);
  });

  const byExercise = new Map<string, WorkoutSetLog[]>();
  for (const log of recent) {
    const key = `${log.exerciseName.trim().toLowerCase()}::${log.section}`;
    const arr = byExercise.get(key) ?? [];
    arr.push(log);
    byExercise.set(key, arr);
  }

  const highlights: ExercisePerformanceHighlight[] = [];
  for (const [, exerciseLogs] of byExercise) {
    exerciseLogs.sort((a, b) => b.date.localeCompare(a.date) || a.setIndex - b.setIndex);
    const lastDate = exerciseLogs[0]?.date;
    const lastSessionLogs = exerciseLogs.filter((l) => l.date === lastDate).sort((a, b) => a.setIndex - b.setIndex);
    const lastSets = lastSessionLogs.map((l) => ({
      weightLbs: l.weightLbs,
      reps: l.reps,
      rpe: l.rpe,
    }));
    const weights = lastSessionLogs.map((l) => l.weightLbs).filter((w): w is number => w != null && w > 0);
    const volume = lastSessionLogs.reduce((sum, l) => {
      if (l.weightLbs == null || l.reps == null) return sum;
      return sum + l.weightLbs * l.reps;
    }, 0);
    highlights.push({
      exerciseName: exerciseLogs[0].exerciseName,
      lastDate,
      lastSets,
      bestWeightLbs: weights.length ? Math.max(...weights) : undefined,
      totalVolumeLbs: volume > 0 ? Math.round(volume) : undefined,
    });
  }

  highlights.sort((a, b) => (b.lastDate ?? "").localeCompare(a.lastDate ?? ""));

  const latestDate = highlights[0]?.lastDate;
  const lastSessionVolumeLbs =
    latestDate != null
      ? recent
          .filter((l) => l.date === latestDate)
          .reduce((sum, l) => {
            if (l.weightLbs == null || l.reps == null) return sum;
            return sum + l.weightLbs * l.reps;
          }, 0)
      : undefined;

  return {
    recentHighlights: highlights.slice(0, 12),
    lastSessionVolumeLbs: lastSessionVolumeLbs && lastSessionVolumeLbs > 0 ? Math.round(lastSessionVolumeLbs) : undefined,
  };
}
