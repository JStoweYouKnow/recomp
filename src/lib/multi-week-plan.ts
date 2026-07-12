import { getWeekStart } from "./date-utils";
import { inferFirstSessionDate } from "./workout-import-start";
import type { FitnessPlan, WorkoutDay } from "./types";

export const MAX_PROGRAM_WEEKS = 12;
export const WEEKS_PER_CHUNK = 2;

export type RegeneratePlanOptions = {
  programWeeks?: number;
  workoutDaysPerWeek?: number;
  reason?: string;
};

export function clampProgramWeeks(weeks: unknown): number {
  const n = typeof weeks === "number" && Number.isFinite(weeks) ? Math.round(weeks) : 1;
  return Math.min(MAX_PROGRAM_WEEKS, Math.max(1, n));
}

export function clampWorkoutDaysPerWeek(days: unknown, fallback = 4): number {
  const n = typeof days === "number" && Number.isFinite(days) ? Math.round(days) : fallback;
  return Math.min(7, Math.max(2, n));
}

/** Append " — Week N" when missing so schedulers can match multi-week programs. */
export function labelWorkoutDayWithWeek(dayLabel: string, weekNumber: number): string {
  const trimmed = dayLabel.trim();
  if (/week\s*\d+/i.test(trimmed)) return trimmed;
  const base = trimmed.replace(/\s*—\s*Week\s*\d+$/i, "").trim() || trimmed;
  return `${base} — Week ${weekNumber}`;
}

export function labelWorkoutDaysForWeek(days: WorkoutDay[], weekNumber: number): WorkoutDay[] {
  return days.map((d) => ({
    ...d,
    day: labelWorkoutDayWithWeek(d.day, weekNumber),
  }));
}

/** Training sessions from week 1 (exclude recovery/rest-only days). */
export function extractWeek1TrainingTemplate(weeklyPlan: WorkoutDay[]): WorkoutDay[] {
  return weeklyPlan.filter((d) => {
    const focus = d.focus.toLowerCase();
    const isRecovery =
      focus.includes("recovery") ||
      focus.includes("mobility") ||
      focus.includes("rest") ||
      focus.includes("off day");
    return d.exercises.length > 0 && !isRecovery;
  });
}

export function applyMultiWeekProgramMetadata(plan: FitnessPlan, totalWeeks: number): FitnessPlan {
  if (totalWeeks <= 1) return plan;
  plan.workoutPlan.programWeekOffset = 0;
  plan.workoutPlan.advancementMode = plan.workoutPlan.advancementMode ?? "calendar";
  plan.workoutPlan.weeklyPlan = labelWorkoutDaysForWeek(plan.workoutPlan.weeklyPlan, 1);
  plan.workoutPlan.programWeek1Start = getWeekStart(inferFirstSessionDate(plan.workoutPlan.weeklyPlan));
  return plan;
}

export function appendWorkoutWeeks(plan: FitnessPlan, extraDays: WorkoutDay[]): FitnessPlan {
  plan.workoutPlan.weeklyPlan = [...plan.workoutPlan.weeklyPlan, ...extraDays];
  return plan;
}

export function chunkWeekRanges(totalWeeks: number, chunkSize = WEEKS_PER_CHUNK): { fromWeek: number; toWeek: number }[] {
  const ranges: { fromWeek: number; toWeek: number }[] = [];
  for (let from = 2; from <= totalWeeks; from += chunkSize) {
    ranges.push({ fromWeek: from, toWeek: Math.min(from + chunkSize - 1, totalWeeks) });
  }
  return ranges;
}

export function parseRegeneratePlanPayload(payload: Record<string, unknown>): RegeneratePlanOptions {
  return {
    programWeeks: payload.programWeeks != null ? clampProgramWeeks(payload.programWeeks) : undefined,
    workoutDaysPerWeek:
      payload.workoutDaysPerWeek != null ? clampWorkoutDaysPerWeek(payload.workoutDaysPerWeek) : undefined,
    reason: typeof payload.reason === "string" ? payload.reason : undefined,
  };
}
