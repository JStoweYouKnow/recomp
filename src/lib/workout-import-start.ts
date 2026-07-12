import { getTodayLocal, getWeekStart, toLocalDateString } from "./date-utils";
import { extractProgramWeek } from "./workout-schedule";

const WEEKDAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
const SHORT_WEEKDAY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/** 0 = Sunday … 6 = Saturday, or null when the label has no weekday. */
export function weekdayIndexFromDayLabel(dayLabel: string): number | null {
  const lower = dayLabel.toLowerCase().trim();
  for (let i = 0; i < WEEKDAY_NAMES.length; i++) {
    const name = WEEKDAY_NAMES[i];
    const short = SHORT_WEEKDAY[i];
    if (lower === name || lower.startsWith(`${name} `) || lower.startsWith(short)) {
      return i;
    }
  }
  return null;
}

/** Next calendar date (YYYY-MM-DD) for this weekday, including today when it matches. */
export function nextOccurrenceOfWeekday(weekdayIndex: number, today = getTodayLocal()): string {
  const todayDow = new Date(today + "T12:00:00").getDay();
  const daysUntil = (weekdayIndex - todayDow + 7) % 7;
  const d = new Date(today + "T12:00:00");
  d.setDate(d.getDate() + daysUntil);
  return toLocalDateString(d);
}

export function isAnchoredWorkoutProgram(weeklyPlan: { day: string }[]): boolean {
  if (weeklyPlan.length > 7) return true;
  return weeklyPlan.some((d) => extractProgramWeek(d.day) !== null);
}

/** First scheduled session date for an imported program (next slot in weekday sequence). */
export function inferFirstSessionDate(weeklyPlan: { day: string }[], today = getTodayLocal()): string {
  const first = weeklyPlan.find((d) => d.day?.trim()) ?? weeklyPlan[0];
  if (!first?.day) return nextOccurrenceOfWeekday(1, today);

  const weekday = weekdayIndexFromDayLabel(first.day);
  if (weekday !== null) return nextOccurrenceOfWeekday(weekday, today);

  return nextOccurrenceOfWeekday(1, today);
}

/**
 * Monday anchor (YYYY-MM-DD) for program week 1.
 * Aligns week 1 with the next occurrence of the plan's opening weekday — e.g. Saturday upload → Monday start.
 */
export function inferProgramWeek1Start(weeklyPlan: { day: string }[], today = getTodayLocal()): string | undefined {
  if (!weeklyPlan.length || !isAnchoredWorkoutProgram(weeklyPlan)) return undefined;
  return getWeekStart(inferFirstSessionDate(weeklyPlan, today));
}

export function formatProgramStartLabel(anchorMonday: string): string {
  const d = new Date(anchorMonday + "T12:00:00");
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}
