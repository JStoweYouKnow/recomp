/**
 * Derive structured workout completion history from plan + workoutProgress.
 * Used by Rico to adapt recommendations after sessions complete.
 */

import { getTodayLocal, toLocalDateString } from "./date-utils";
import type { FitnessPlan, WorkoutDay, WorkoutExercise, WorkoutSetLog } from "./types";
import {
  buildWorkoutPerformanceSummary,
  logsForExerciseOnDate,
  type ExercisePerformanceHighlight,
  type WorkoutPerformanceSummary,
} from "./workout-set-logs";
import {
  countRecentMissed,
  isWorkoutSessionComplete,
  matchDayToDate,
  trainingWeeksElapsed,
  type WorkoutProgressMap,
} from "./workout-schedule";
import {
  buildFatigueSignals,
  resolveMesocycle,
  type DeloadRecommendation,
  type MesocycleState,
} from "./mesocycle";
import {
  buildAllProgressions,
  prescribeWorkoutDay,
  summarizeProgressions,
  type ProgressionSummary,
  type SetPrescription,
} from "./progression";
import { computeWeeklyVolume, type WeeklyVolumeSummary } from "./muscle-volume";
import { getWeekStart } from "./date-utils";

export interface CompletedSessionSummary {
  date: string;
  planIndex: number;
  day: string;
  focus: string;
  exercisesCompleted: string[];
  exerciseCount: number;
  performance?: {
    totalVolumeLbs?: number;
    exerciseHighlights: ExercisePerformanceHighlight[];
  };
}

export interface WorkoutHistorySummary {
  sessionsCompletedLast7Days: number;
  sessionsCompletedLast14Days: number;
  recentSessions: CompletedSessionSummary[];
  exerciseFrequency: Record<string, number>;
  focusFrequency: Record<string, number>;
  performance?: WorkoutPerformanceSummary;
}

export interface NextWorkoutPreview {
  planIndex: number;
  day: string;
  focus: string;
  scheduledDate: string | null;
  mainExercises: string[];
}

function allExercises(day: WorkoutDay): { exercise: WorkoutExercise; section: "warmup" | "main" | "finisher" }[] {
  const out: { exercise: WorkoutExercise; section: "warmup" | "main" | "finisher" }[] = [];
  for (const ex of day.warmups ?? []) out.push({ exercise: ex, section: "warmup" });
  for (const ex of day.exercises) out.push({ exercise: ex, section: "main" });
  for (const ex of day.finishers ?? []) out.push({ exercise: ex, section: "finisher" });
  return out;
}

function sessionPerformance(
  plan: FitnessPlan,
  day: WorkoutDay,
  date: string,
  setLogs: WorkoutSetLog[],
): CompletedSessionSummary["performance"] | undefined {
  let globalSlot = 0;
  const highlights: ExercisePerformanceHighlight[] = [];
  let totalVolume = 0;

  for (const section of ["warmup", "main", "finisher"] as const) {
    const list =
      section === "warmup" ? day.warmups ?? [] : section === "finisher" ? day.finishers ?? [] : day.exercises;
    for (const exercise of list) {
      const logs = logsForExerciseOnDate(setLogs, plan.id, date, day.day, section, exercise.name, globalSlot);
      globalSlot += 1;
      if (logs.length === 0) continue;
      const lastSets = logs.map((l) => ({ weightLbs: l.weightLbs, reps: l.reps, rpe: l.rpe }));
      const weights = logs.map((l) => l.weightLbs).filter((w): w is number => w != null && w > 0);
      const volume = logs.reduce((sum, l) => {
        if (l.weightLbs == null || l.reps == null) return sum;
        return sum + l.weightLbs * l.reps;
      }, 0);
      totalVolume += volume;
      highlights.push({
        exerciseName: exercise.name,
        lastDate: date,
        lastSets,
        bestWeightLbs: weights.length ? Math.max(...weights) : undefined,
        totalVolumeLbs: volume > 0 ? Math.round(volume) : undefined,
      });
    }
  }

  if (highlights.length === 0) return undefined;
  return {
    totalVolumeLbs: totalVolume > 0 ? Math.round(totalVolume) : undefined,
    exerciseHighlights: highlights,
  };
}

export function summarizeCompletedSession(
  plan: FitnessPlan,
  planIndex: number,
  date: string,
  progress: WorkoutProgressMap,
  setLogs: WorkoutSetLog[] = [],
): CompletedSessionSummary | null {
  const day = plan.workoutPlan.weeklyPlan[planIndex];
  if (!day || !isWorkoutSessionComplete(plan, planIndex, date, progress)) return null;

  const exercisesCompleted = allExercises(day)
    .map(({ exercise }) => exercise.name.trim())
    .filter(Boolean);

  return {
    date,
    planIndex,
    day: day.day,
    focus: day.focus,
    exercisesCompleted,
    exerciseCount: exercisesCompleted.length,
    performance: sessionPerformance(plan, day, date, setLogs),
  };
}

export function getCompletedSessionForDate(
  plan: FitnessPlan,
  progress: WorkoutProgressMap,
  date: string,
  setLogs: WorkoutSetLog[] = [],
): CompletedSessionSummary | null {
  const planIndex = matchDayToDate(plan, date);
  if (planIndex === null) return null;
  return summarizeCompletedSession(plan, planIndex, date, progress, setLogs);
}

export function detectNewlyCompletedSession(
  plan: FitnessPlan,
  oldProgress: WorkoutProgressMap,
  newProgress: WorkoutProgressMap,
  date: string,
  setLogs: WorkoutSetLog[] = [],
): CompletedSessionSummary | null {
  const planIndex = matchDayToDate(plan, date);
  if (planIndex === null) return null;
  const wasComplete = isWorkoutSessionComplete(plan, planIndex, date, oldProgress);
  const isComplete = isWorkoutSessionComplete(plan, planIndex, date, newProgress);
  if (wasComplete || !isComplete) return null;
  return summarizeCompletedSession(plan, planIndex, date, newProgress, setLogs);
}

export function listCompletedSessions(
  plan: FitnessPlan,
  progress: WorkoutProgressMap,
  lookbackDays: number,
  today = getTodayLocal(),
  setLogs: WorkoutSetLog[] = [],
): CompletedSessionSummary[] {
  const sessions: CompletedSessionSummary[] = [];
  const seen = new Set<string>();

  for (let offset = 0; offset < lookbackDays; offset++) {
    const d = new Date(today + "T12:00:00");
    d.setDate(d.getDate() - offset);
    const dateStr = toLocalDateString(d);
    const planIndex = matchDayToDate(plan, dateStr);
    if (planIndex === null) continue;

    const key = `${planIndex}:${dateStr}`;
    if (seen.has(key)) continue;

    const summary = summarizeCompletedSession(plan, planIndex, dateStr, progress, setLogs);
    if (!summary) continue;

    seen.add(key);
    sessions.push(summary);
  }

  return sessions.sort((a, b) => b.date.localeCompare(a.date));
}

export function buildWorkoutHistorySummary(
  plan: FitnessPlan,
  progress: WorkoutProgressMap,
  lookbackDays = 28,
  today = getTodayLocal(),
  setLogs: WorkoutSetLog[] = [],
): WorkoutHistorySummary {
  const recentSessions = listCompletedSessions(plan, progress, lookbackDays, today, setLogs);
  const exerciseFrequency: Record<string, number> = {};
  const focusFrequency: Record<string, number> = {};

  for (const session of recentSessions) {
    const focusKey = session.focus.trim().toLowerCase();
    if (focusKey) focusFrequency[focusKey] = (focusFrequency[focusKey] ?? 0) + 1;
    for (const name of session.exercisesCompleted) {
      const key = name.toLowerCase();
      exerciseFrequency[key] = (exerciseFrequency[key] ?? 0) + 1;
    }
  }

  const withinDays = (days: number) =>
    recentSessions.filter((s) => {
      const sessionDate = new Date(s.date + "T12:00:00");
      const cutoff = new Date(today + "T12:00:00");
      cutoff.setDate(cutoff.getDate() - days);
      return sessionDate >= cutoff;
    }).length;

  return {
    sessionsCompletedLast7Days: withinDays(7),
    sessionsCompletedLast14Days: withinDays(14),
    recentSessions: recentSessions.slice(0, 8),
    exerciseFrequency,
    focusFrequency,
    performance: buildWorkoutPerformanceSummary(setLogs, lookbackDays, today),
  };
}

export function findNextScheduledWorkout(
  plan: FitnessPlan,
  progress: WorkoutProgressMap,
  today = getTodayLocal(),
  horizonDays = 14,
): NextWorkoutPreview | null {
  for (let offset = 0; offset <= horizonDays; offset++) {
    const d = new Date(today + "T12:00:00");
    d.setDate(d.getDate() + offset);
    const dateStr = toLocalDateString(d);
    const planIndex = matchDayToDate(plan, dateStr);
    if (planIndex === null) continue;
    if (isWorkoutSessionComplete(plan, planIndex, dateStr, progress)) continue;

    const day = plan.workoutPlan.weeklyPlan[planIndex];
    if (!day) continue;

    return {
      planIndex,
      day: day.day,
      focus: day.focus,
      scheduledDate: dateStr,
      mainExercises: day.exercises.map((ex) => ex.name.trim()).filter(Boolean),
    };
  }
  return null;
}

/**
 * Where the lifter sits in the current training block, with an early deload substituted
 * when fatigue signals demand one. Drives both the prescription and the UI banner.
 */
export function buildMesocycleContext(
  plan: FitnessPlan,
  progress: WorkoutProgressMap,
  today: string,
  setLogs: WorkoutSetLog[],
  options: { readinessScore?: number; musclesOverMrv?: number; blockLength?: number } = {},
): { state: MesocycleState; deload: DeloadRecommendation; deloadForced: boolean } {
  const programWeek = trainingWeeksElapsed(plan, today);
  const signals =
    setLogs.length > 0
      ? buildFatigueSignals({
          progressions: buildAllProgressions(setLogs),
          setLogs,
          musclesOverMrv: options.musclesOverMrv,
          readinessScore: options.readinessScore,
          missedSessions: countRecentMissed(plan, progress, 7, today),
          today,
        })
      : undefined;

  return resolveMesocycle({ programWeek, blockLength: options.blockLength, signals });
}

/**
 * Load targets for the next scheduled session, computed from logged history and scaled
 * by the current block phase (a deload week halves sets and drops load).
 * Returns [] when there is no upcoming session or nothing has been logged yet.
 */
export function buildNextSessionPrescriptions(
  plan: FitnessPlan | null,
  progress: WorkoutProgressMap,
  today = getTodayLocal(),
  setLogs: WorkoutSetLog[] = [],
  readinessScore?: number,
  mesocycle?: MesocycleState,
): SetPrescription[] {
  if (!plan || setLogs.length === 0) return [];
  const next = findNextScheduledWorkout(plan, progress, today);
  if (!next) return [];

  const day = plan.workoutPlan.weeklyPlan[next.planIndex];
  if (!day) return [];

  // Warmups are not load-progressed; finishers are.
  const trained = [...day.exercises, ...(day.finishers ?? [])];
  return prescribeWorkoutDay(trained, setLogs, {
    readinessScore,
    today,
    intensityMultiplier: mesocycle?.intensityMultiplier,
    volumeMultiplier: mesocycle?.volumeMultiplier,
  });
}

export function buildRicoWorkoutLearningContext(
  plan: FitnessPlan | null,
  progress: WorkoutProgressMap,
  today = getTodayLocal(),
  setLogs: WorkoutSetLog[] = [],
  readinessScore?: number,
  options: { fitnessLevel?: string; muscleLookup?: Record<string, string[]> } = {},
): {
  workoutHistory?: WorkoutHistorySummary;
  completedWorkoutToday?: CompletedSessionSummary;
  nextWorkout?: NextWorkoutPreview;
  workoutPerformance?: WorkoutPerformanceSummary;
  nextSessionTargets?: SetPrescription[];
  strengthTrend?: ProgressionSummary;
  weeklyVolume?: WeeklyVolumeSummary;
  mesocycle?: MesocycleState & { deloadForced: boolean; deloadUrgency: string; deloadReasons: string[] };
} {
  if (!plan) return {};
  const history = buildWorkoutHistorySummary(plan, progress, 28, today, setLogs);
  const progressions = setLogs.length > 0 ? buildAllProgressions(setLogs) : [];
  const volume =
    setLogs.length > 0
      ? computeWeeklyVolume(setLogs, getWeekStart(today), {
          fitnessLevel: options.fitnessLevel,
          muscleLookup: options.muscleLookup,
        })
      : undefined;

  // The block phase scales the prescription, so it must be resolved first.
  const meso = buildMesocycleContext(plan, progress, today, setLogs, {
    readinessScore,
    musclesOverMrv: volume?.overdosed.length ?? 0,
  });
  const targets = buildNextSessionPrescriptions(
    plan,
    progress,
    today,
    setLogs,
    readinessScore,
    meso.state,
  );

  return {
    mesocycle: {
      ...meso.state,
      deloadForced: meso.deloadForced,
      deloadUrgency: meso.deload.urgency,
      deloadReasons: meso.deload.reasons,
    },
    workoutHistory: history,
    completedWorkoutToday: getCompletedSessionForDate(plan, progress, today, setLogs) ?? undefined,
    nextWorkout: findNextScheduledWorkout(plan, progress, today) ?? undefined,
    workoutPerformance: history.performance,
    nextSessionTargets: targets.length > 0 ? targets : undefined,
    strengthTrend: progressions.length > 0 ? summarizeProgressions(progressions, 14, today) : undefined,
    weeklyVolume: volume,
  };
}
