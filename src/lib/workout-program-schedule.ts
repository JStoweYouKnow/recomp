/**
 * Matches Swift `WorkoutProgramSchedule` — calendar program weeks + `Week N` labels,
 * not "first matching weekday in the flat list" (which collapses multi-week plans).
 */
import type { FitnessPlan } from "./types";

const WEEKDAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const SHORT_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function extractProgramWeek(dayLabel: string): number | null {
  const lower = dayLabel.toLowerCase();
  const w = lower.indexOf("week");
  if (w === -1) return null;
  let tail = lower.slice(w + 4);
  tail = tail.replace(/^[\s:]+/, "");
  let num = "";
  for (const c of tail) {
    if (c >= "0" && c <= "9") num += c;
  }
  return num ? parseInt(num, 10) : null;
}

function weekdayMatches(planDay: string, dayName: string, shortName: string): boolean {
  const p = planDay.toLowerCase();
  return p === dayName || p === shortName || p.startsWith(dayName) || p.startsWith(shortName);
}

/** Monday 00:00 local for the week containing this calendar day (YYYY-MM-DD). */
export function mondayWeekStartContainingDate(dateStr: string): Date {
  const d = new Date(dateStr + "T12:00:00");
  const dow = d.getDay();
  const daysFromMonday = dow === 0 ? -6 : -(dow - 1);
  const mon = new Date(d);
  mon.setDate(d.getDate() + daysFromMonday);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

export function mondayWeeksElapsed(anchorMonday: Date, otherMonday: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const days = Math.round((otherMonday.getTime() - anchorMonday.getTime()) / msPerDay);
  return Math.floor(days / 7);
}

/** 1-based program week from anchor; values below 1 mean "before program week 1" (Swift `planIndex`). */
export function rawProgramWeekForDate(programWeek1Start: string, dateStr: string): number {
  const anchorMonday = mondayWeekStartContainingDate(programWeek1Start);
  const selectedMonday = mondayWeekStartContainingDate(dateStr);
  return mondayWeeksElapsed(anchorMonday, selectedMonday) + 1;
}

/** For listing/completion: weeks before start clamp to program week 1 (matches Swift `displayedPlanItems`). */
function displayProgramWeekForDate(programWeek1Start: string, dateStr: string): number {
  const w = rawProgramWeekForDate(programWeek1Start, dateStr);
  return w < 1 ? 1 : w;
}

type DayRow = { day: string };

function planDayIndexForRows<T extends DayRow>(
  weeklyPlan: T[],
  programWeek1Start: string | undefined,
  dateStr: string
): number | null {
  if (!weeklyPlan.length) return null;

  const d = new Date(dateStr + "T12:00:00");
  const dow = d.getDay();
  const dayName = WEEKDAY_NAMES[dow];
  const shortName = SHORT_NAMES[dow];

  if (weeklyPlan.length > 7) {
    if (programWeek1Start) {
      const programWeek = rawProgramWeekForDate(programWeek1Start, dateStr);
      if (programWeek >= 1) {
        for (let i = 0; i < weeklyPlan.length; i++) {
          const pd = weeklyPlan[i].day.toLowerCase();
          if (!weekdayMatches(pd, dayName, shortName)) continue;
          const wn = extractProgramWeek(weeklyPlan[i].day);
          if (wn !== null && wn === programWeek) return i;
        }
      }
      return null;
    }
    for (let i = 0; i < weeklyPlan.length; i++) {
      const pd = weeklyPlan[i].day.toLowerCase();
      if (!weekdayMatches(pd, dayName, shortName)) continue;
      if (extractProgramWeek(weeklyPlan[i].day) === 1) return i;
    }
    return null;
  }

  for (let i = 0; i < weeklyPlan.length; i++) {
    if (weekdayMatches(weeklyPlan[i].day.toLowerCase(), dayName, shortName)) return i;
  }

  const mondayBased = dow === 0 ? 6 : dow - 1;
  if (mondayBased < weeklyPlan.length) return mondayBased;
  return null;
}

/** Resolve workout row index using the current `weeklyPlan` slice (e.g. while editing). */
export function planWorkoutDayIndexForWeeklyPlan(
  weeklyPlan: { day: string }[],
  programWeek1Start: string | undefined,
  dateStr: string
): number | null {
  return planDayIndexForRows(weeklyPlan, programWeek1Start, dateStr);
}

/** Index into `plan.workoutPlan.weeklyPlan` for the session on `dateStr` (YYYY-MM-DD). */
export function planWorkoutDayIndexForDate(plan: FitnessPlan, dateStr: string): number | null {
  return planDayIndexForRows(
    plan.workoutPlan.weeklyPlan,
    plan.workoutPlan.programWeek1Start,
    dateStr
  );
}

/** Index into `plan.dietPlan.weeklyPlan` — uses workout `programWeek1Start` when present. */
export function planDietDayIndexForDate(plan: FitnessPlan, dateStr: string): number | null {
  return planDayIndexForRows(plan.dietPlan.weeklyPlan, plan.workoutPlan.programWeek1Start, dateStr);
}

/**
 * Plan row indices to show for PDF-style plans: current program week only.
 * Classic ≤7-day plans return every index.
 */
export function getDisplayedWorkoutPlanIndicesFromRows(
  weeklyPlan: { day: string }[],
  programWeek1Start: string | undefined,
  dateStr: string
): number[] {
  const wp = weeklyPlan;
  if (wp.length <= 7) return wp.map((_, i) => i);

  if (programWeek1Start) {
    const programWeek = displayProgramWeekForDate(programWeek1Start, dateStr);
    const indices: number[] = [];
    for (let i = 0; i < wp.length; i++) {
      if (extractProgramWeek(wp[i].day) === programWeek) indices.push(i);
    }
    if (indices.length > 0) return indices;
  } else {
    const indices: number[] = [];
    for (let i = 0; i < wp.length; i++) {
      if (extractProgramWeek(wp[i].day) === 1) indices.push(i);
    }
    if (indices.length > 0) return indices;
  }
  return wp.map((_, i) => i);
}

export function getDisplayedWorkoutPlanIndices(plan: FitnessPlan, dateStr: string): number[] {
  return getDisplayedWorkoutPlanIndicesFromRows(
    plan.workoutPlan.weeklyPlan,
    plan.workoutPlan.programWeek1Start,
    dateStr
  );
}

/** Same program-week windowing for diet rows (multi-week meal plans). */
export function getDisplayedDietPlanIndices(plan: FitnessPlan, dateStr: string): number[] {
  const dp = plan.dietPlan.weeklyPlan;
  if (dp.length <= 7) return dp.map((_, i) => i);

  const anchor = plan.workoutPlan.programWeek1Start;
  if (anchor) {
    const programWeek = displayProgramWeekForDate(anchor, dateStr);
    const indices: number[] = [];
    for (let i = 0; i < dp.length; i++) {
      if (extractProgramWeek(dp[i].day) === programWeek) indices.push(i);
    }
    if (indices.length > 0) return indices;
  } else {
    const indices: number[] = [];
    for (let i = 0; i < dp.length; i++) {
      if (extractProgramWeek(dp[i].day) === 1) indices.push(i);
    }
    if (indices.length > 0) return indices;
  }
  return dp.map((_, i) => i);
}
