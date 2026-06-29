/**
 * Shared workout scheduling: program week resolution, missed-session detection,
 * catch-up queue, and schedule mutations. Used by web, API, Swift, and Android.
 */

import { getTodayLocal, getWeekStart, isTimestampInWeek, mondayWeeksElapsed, toLocalDateString } from "./date-utils";
import type {
  FitnessPlan,
  MissedSession,
  MissedSessionStatus,
  ScheduleAction,
  WorkoutDay,
  WorkoutExercise,
} from "./types";

export type WorkoutProgressMap = Record<string, string>;

const WEEKDAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
const SHORT_WEEKDAY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export function weekdayMatches(planDay: string, dayName: string, shortName: string): boolean {
  const p = planDay.toLowerCase().trim();
  return p === dayName || p === shortName || p.startsWith(dayName) || p.startsWith(shortName);
}

export function extractProgramWeek(dayLabel: string): number | null {
  const m = dayLabel.match(/week\s*(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

/** Index into weeklyPlan for the session on `date` (YYYY-MM-DD), or null (rest day). */
export function matchDayToDate(plan: FitnessPlan, date: string): number | null {
  const d = new Date(date + "T12:00:00");
  const dow = d.getDay();
  const dayName = WEEKDAY_NAMES[dow];
  const shortName = SHORT_WEEKDAY[dow];
  const wp = plan.workoutPlan.weeklyPlan;
  const anchor = plan.workoutPlan.programWeek1Start;

  if (anchor && wp.length > 7) {
    const programWeek = effectiveProgramWeek(plan, getWeekStart(date));
    if (programWeek >= 1) {
      for (let i = 0; i < wp.length; i++) {
        const planDay = wp[i].day.toLowerCase().trim();
        if (!weekdayMatches(planDay, dayName, shortName)) continue;
        const wm = extractProgramWeek(planDay);
        if (wm === programWeek) return i;
      }
    }
    return null;
  }

  for (let i = 0; i < wp.length; i++) {
    if (weekdayMatches(wp[i].day.toLowerCase().trim(), dayName, shortName)) return i;
  }

  const mondayBased = dow === 0 ? 6 : dow - 1;
  return mondayBased < wp.length ? mondayBased : null;
}

/** 1-based program week for a Monday week-start, honoring offset, pause, and completion mode. */
export function effectiveProgramWeek(plan: FitnessPlan, weekStartMonday: string, today = getTodayLocal()): number {
  const wp = plan.workoutPlan;
  const anchor = wp.programWeek1Start;
  if (!anchor || plan.workoutPlan.weeklyPlan.length <= 7) return 1;

  if (wp.pausedUntil && weekStartMonday <= wp.pausedUntil) {
    const pausedWeekStart = getWeekStart(wp.pausedUntil);
    const baseAtPause = mondayWeeksElapsed(anchor, pausedWeekStart) + 1;
    const offset = wp.programWeekOffset ?? 0;
    return Math.max(1, baseAtPause - offset);
  }

  let elapsed = mondayWeeksElapsed(anchor, weekStartMonday) + 1;
  const offset = wp.programWeekOffset ?? 0;
  let week = Math.max(1, elapsed - offset);

  if (wp.advancementMode === "completion") {
    const maxCalendarWeek = elapsed;
    while (week < maxCalendarWeek && isProgramWeekFullyComplete(plan, week, {})) {
      week += 1;
    }
    week = Math.min(week, maxCalendarWeek);
  }

  return week;
}

function allExercises(day: WorkoutDay): { exercise: WorkoutExercise; section: "warmup" | "main" | "finisher" }[] {
  const out: { exercise: WorkoutExercise; section: "warmup" | "main" | "finisher" }[] = [];
  for (const ex of day.warmups ?? []) out.push({ exercise: ex, section: "warmup" });
  for (const ex of day.exercises) out.push({ exercise: ex, section: "main" });
  for (const ex of day.finishers ?? []) out.push({ exercise: ex, section: "finisher" });
  return out;
}

export function exerciseProgressKey(
  planId: string,
  day: WorkoutDay,
  exercise: WorkoutExercise,
  section: "warmup" | "main" | "finisher" = "main",
  weekStart?: string
): string {
  const base =
    section === "main"
      ? `${planId}:${day.day}:${exercise.name}:${exercise.sets}:${exercise.reps}:${exercise.notes ?? ""}`
      : `${planId}:${day.day}:${section}:${exercise.name}:${exercise.sets}:${exercise.reps}:${exercise.notes ?? ""}`;
  return weekStart
    ? `${planId}:${weekStart}:${day.day}:${section}:${exercise.name}:${exercise.sets}:${exercise.reps}:${exercise.notes ?? ""}`
    : base;
}

function progressForDate(
  plan: FitnessPlan,
  day: WorkoutDay,
  date: string,
  progress: WorkoutProgressMap
): Record<string, string> {
  const weekStart = getWeekStart(date);
  const filtered: Record<string, string> = {};
  for (const [k, ts] of Object.entries(progress)) {
    if (!ts) continue;
    const parts = k.split(":");
    const isWeekScoped = parts[1] && /^\d{4}-\d{2}-\d{2}$/.test(parts[1]);
    const legacyKey = toLegacyLookupKey(k);
    if (!legacyKey) continue;
    if (isWeekScoped && parts[1] === weekStart) {
      filtered[legacyKey] = ts;
    } else if (!isWeekScoped && isTimestampInWeek(ts, weekStart)) {
      filtered[legacyKey] = ts;
    }
  }
  return filtered;
}

function toLegacyLookupKey(key: string): string | null {
  const parts = key.split(":");
  const hasWeek = parts[1] && /^\d{4}-\d{2}-\d{2}$/.test(parts[1]);
  if (hasWeek && parts.length >= 7) {
    const [planId, , day, section, exercise, sets, reps, ...noteParts] = parts;
    const notes = noteParts.join(":") ?? "";
    if (section === "main") return `${planId}:${day}:${exercise}:${sets}:${reps}:${notes}`;
    return `${planId}:${day}:${section}:${exercise}:${sets}:${reps}:${notes}`;
  }
  if (!hasWeek && parts.length >= 5) return key;
  return null;
}

/** True when every exercise for this session has progress logged on `date`. */
export function isWorkoutSessionComplete(
  plan: FitnessPlan,
  planIndex: number,
  date: string,
  progress: WorkoutProgressMap
): boolean {
  const day = plan.workoutPlan.weeklyPlan[planIndex];
  if (!day) return false;
  const items = allExercises(day);
  if (items.length === 0) return false;

  const weekProgress = progressForDate(plan, day, date, progress);
  const weekStart = getWeekStart(date);

  const doneOnDate = items.filter(({ exercise, section }) => {
    const key = exerciseProgressKey(plan.id, day, exercise, section);
    const weekKey = exerciseProgressKey(plan.id, day, exercise, section, weekStart);
    const ts = weekProgress[key] ?? progress[weekKey] ?? progress[key];
    return ts?.slice(0, 10) === date;
  }).length;

  return doneOnDate >= items.length;
}

export function isProgramWeekFullyComplete(
  plan: FitnessPlan,
  programWeek: number,
  progress: WorkoutProgressMap,
  referenceDate = getTodayLocal()
): boolean {
  const sessions = plan.workoutPlan.weeklyPlan
    .map((day, planIndex) => ({ day, planIndex }))
    .filter(({ day }) => extractProgramWeek(day.day) === programWeek || (programWeek === 1 && !extractProgramWeek(day.day)));

  if (sessions.length === 0) return false;

  const weekStart = getWeekStart(referenceDate);
  return sessions.every(({ planIndex }) => {
    const dateForSession = sessionDateInWeek(plan, planIndex, weekStart);
    return dateForSession ? isWorkoutSessionComplete(plan, planIndex, dateForSession, progress) : false;
  });
}

/** Best-effort calendar date for a plan row within a Monday week. */
export function sessionDateInWeek(plan: FitnessPlan, planIndex: number, weekStartMonday: string): string | null {
  const day = plan.workoutPlan.weeklyPlan[planIndex];
  if (!day) return null;
  const label = day.day.toLowerCase();
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStartMonday + "T12:00:00");
    d.setDate(d.getDate() + i);
    const dateStr = toLocalDateString(d);
    if (matchDayToDate(plan, dateStr) === planIndex) return dateStr;
    const dow = d.getDay();
    const dayName = WEEKDAY_NAMES[dow];
    if (weekdayMatches(label, dayName, SHORT_WEEKDAY[dow])) return dateStr;
  }
  return weekStartMonday;
}

function sessionId(planIndex: number, scheduledDate: string): string {
  return `${planIndex}:${scheduledDate}`;
}

function existingMissedIds(sessions: MissedSession[] | undefined): Set<string> {
  return new Set((sessions ?? []).map((s) => s.id));
}

/** Scan past `lookbackDays` for scheduled-but-incomplete sessions not yet tracked. */
export function detectMissedSessions(
  plan: FitnessPlan,
  progress: WorkoutProgressMap,
  today = getTodayLocal(),
  lookbackDays = 14
): MissedSession[] {
  const known = existingMissedIds(plan.workoutPlan.missedSessions);
  const found: MissedSession[] = [];

  for (let i = 1; i <= lookbackDays; i++) {
    const d = new Date(today + "T12:00:00");
    d.setDate(d.getDate() - i);
    const dateStr = toLocalDateString(d);
    const planIndex = matchDayToDate(plan, dateStr);
    if (planIndex === null) continue;

    const id = sessionId(planIndex, dateStr);
    if (known.has(id)) continue;

    const alreadyTracked = (plan.workoutPlan.missedSessions ?? []).some(
      (s) => s.planIndex === planIndex && s.scheduledDate === dateStr && s.status !== "missed"
    );
    if (alreadyTracked) continue;

    if (isWorkoutSessionComplete(plan, planIndex, dateStr, progress)) continue;

    const day = plan.workoutPlan.weeklyPlan[planIndex];
    found.push({
      id,
      planIndex,
      scheduledDate: dateStr,
      status: "missed",
      dayLabel: day.day,
      focus: day.focus,
    });
  }

  return found;
}

/** Pending catch-up items: missed + rescheduled not yet completed. */
export function getCatchUpQueue(plan: FitnessPlan): MissedSession[] {
  return (plan.workoutPlan.missedSessions ?? [])
    .filter((s) => s.status === "missed" || (s.status === "rescheduled" && s.rescheduledTo))
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
}

export function countRecentMissed(plan: FitnessPlan, progress: WorkoutProgressMap, days = 7, today = getTodayLocal()): number {
  const detected = detectMissedSessions(plan, progress, today, days);
  const tracked = (plan.workoutPlan.missedSessions ?? []).filter(
    (s) => s.status === "missed" && s.scheduledDate >= offsetDate(today, -days)
  );
  const ids = new Set([...detected.map((s) => s.id), ...tracked.map((s) => s.id)]);
  return ids.size;
}

function offsetDate(dateStr: string, dayDelta: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + dayDelta);
  return toLocalDateString(d);
}

export function shouldShowCatchUpBanner(
  plan: FitnessPlan,
  progress: WorkoutProgressMap,
  today = getTodayLocal()
): boolean {
  const dismissed = plan.workoutPlan.catchUpBannerDismissedAt;
  if (dismissed && dismissed.slice(0, 10) === today) return false;
  return countRecentMissed(plan, progress, 7, today) >= 2;
}

export interface ApplyScheduleOptions {
  today?: string;
  planIndex?: number;
  scheduledDate?: string;
  rescheduledTo?: string;
  weeksMissed?: number;
  feedback?: string;
}

export interface ScheduleAdjustResult {
  workoutPlan: FitnessPlan["workoutPlan"];
  summary: string;
  addedMissed: MissedSession[];
}

function makeMissedEntry(
  plan: FitnessPlan,
  planIndex: number,
  scheduledDate: string,
  status: MissedSessionStatus,
  rescheduledTo?: string
): MissedSession {
  const day = plan.workoutPlan.weeklyPlan[planIndex];
  return {
    id: sessionId(planIndex, scheduledDate),
    planIndex,
    scheduledDate,
    status,
    rescheduledTo,
    dayLabel: day?.day,
    focus: day?.focus,
  };
}

function upsertMissedSession(sessions: MissedSession[], entry: MissedSession): MissedSession[] {
  const next = sessions.filter((s) => s.id !== entry.id);
  next.push(entry);
  return next;
}

/** Apply a schedule action and return updated workoutPlan (immutable). */
export function applyScheduleAction(
  plan: FitnessPlan,
  action: ScheduleAction,
  progress: WorkoutProgressMap,
  options: ApplyScheduleOptions = {}
): ScheduleAdjustResult {
  const today = options.today ?? getTodayLocal();
  const wp = { ...plan.workoutPlan };
  let missed = [...(wp.missedSessions ?? [])];
  const addedMissed: MissedSession[] = [];
  let summary = "";

  const detected = detectMissedSessions(plan, progress, today);

  switch (action) {
    case "stay_on_week":
    case "repeat_week": {
      const weeks = options.weeksMissed ?? Math.max(1, Math.ceil(countRecentMissed(plan, progress, 7, today) / 3));
      wp.programWeekOffset = (wp.programWeekOffset ?? 0) + weeks;
      summary = `Staying on your current program week (offset +${weeks}).`;
      for (const s of detected) {
        const entry = { ...s, status: "skipped" as const };
        addedMissed.push(entry);
        missed = upsertMissedSession(missed, entry);
      }
      break;
    }
    case "skip_week": {
      for (const s of detected) {
        const entry = { ...s, status: "skipped" as const };
        addedMissed.push(entry);
        missed = upsertMissedSession(missed, entry);
      }
      summary = `Skipped ${addedMissed.length} missed session(s) and continuing on your calendar schedule.`;
      break;
    }
    case "catch_up": {
      for (const s of detected) {
        addedMissed.push(s);
        missed = upsertMissedSession(missed, s);
      }
      wp.advancementMode = wp.advancementMode ?? "calendar";
      summary =
        addedMissed.length > 0
          ? `Added ${addedMissed.length} session(s) to your catch-up queue.`
          : "Catch-up queue is up to date.";
      break;
    }
    case "skip_today": {
      const planIndex = options.planIndex ?? matchDayToDate(plan, today);
      if (planIndex !== null) {
        const entry = makeMissedEntry(plan, planIndex, today, "skipped");
        addedMissed.push(entry);
        missed = upsertMissedSession(missed, entry);
        summary = `Skipped today's workout (${plan.workoutPlan.weeklyPlan[planIndex]?.focus ?? "session"}).`;
      } else {
        summary = "No workout scheduled for today.";
      }
      break;
    }
    case "reschedule": {
      const planIndex = options.planIndex;
      const scheduledDate = options.scheduledDate;
      const rescheduledTo = options.rescheduledTo;
      if (planIndex == null || !scheduledDate || !rescheduledTo) {
        summary = "Reschedule requires planIndex, scheduledDate, and rescheduledTo.";
        break;
      }
      const entry = makeMissedEntry(plan, planIndex, scheduledDate, "rescheduled", rescheduledTo);
      addedMissed.push(entry);
      missed = upsertMissedSession(missed, entry);
      summary = `Rescheduled ${entry.dayLabel ?? "session"} from ${scheduledDate} to ${rescheduledTo}.`;
      break;
    }
  }

  wp.missedSessions = missed;
  delete wp.catchUpBannerDismissedAt;

  return { workoutPlan: wp, summary, addedMissed };
}

export function dismissCatchUpBanner(plan: FitnessPlan, at = new Date().toISOString()): FitnessPlan {
  return {
    ...plan,
    workoutPlan: {
      ...plan.workoutPlan,
      catchUpBannerDismissedAt: at,
    },
  };
}

export function removeCatchUpItem(plan: FitnessPlan, sessionId: string): FitnessPlan {
  return {
    ...plan,
    workoutPlan: {
      ...plan.workoutPlan,
      missedSessions: (plan.workoutPlan.missedSessions ?? []).filter((s) => s.id !== sessionId),
    },
  };
}
