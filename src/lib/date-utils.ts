/**
 * Format a Date as YYYY-MM-DD in the user's local timezone.
 */
export function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Return today's date (YYYY-MM-DD) in the user's local timezone.
 * Use this instead of new Date().toISOString().slice(0, 10), which uses UTC
 * and can show the wrong day (e.g. Wed evening PST = Thu in UTC).
 */
export function getTodayLocal(): string {
  return toLocalDateString(new Date());
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateString(s: string): boolean {
  return DATE_RE.test(s);
}

export function parseClientDateString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const d = value.slice(0, 10);
  return isValidDateString(d) ? d : undefined;
}

/**
 * Calendar day in a client timezone from `Date.getTimezoneOffset()` (minutes).
 * Used on the server when the client sends its offset but not an explicit date.
 */
export function getTodayFromTimezoneOffset(offsetMinutes: number): string {
  const shifted = new Date(Date.now() - offsetMinutes * 60_000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Coerce client `Date.getTimezoneOffset()` values (number or numeric string). */
export function coerceTimezoneOffsetMinutes(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/** Resolve the calendar day for a new meal log (client local > TZ offset > server local). */
export function resolveMealLogDate(opts?: {
  clientDate?: unknown;
  timezoneOffsetMinutes?: unknown;
}): string {
  const fromClient = parseClientDateString(opts?.clientDate);
  if (fromClient) return fromClient;
  const offset = coerceTimezoneOffsetMinutes(opts?.timezoneOffsetMinutes);
  if (offset !== undefined) {
    return getTodayFromTimezoneOffset(offset);
  }
  return getTodayLocal();
}

/** Get the Monday (week start) for a given date string (YYYY-MM-DD). Returns YYYY-MM-DD. */
export function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const dow = d.getDay();
  const daysToMonday = dow === 0 ? 6 : dow - 1;
  d.setDate(d.getDate() - daysToMonday);
  return toLocalDateString(d);
}

/** Whole weeks between two Monday week-start dates (inclusive of start week = 0). */
export function mondayWeeksElapsed(anchorWeekStartMonday: string, otherWeekStartMonday: string): number {
  const a = new Date(anchorWeekStartMonday + "T12:00:00").getTime();
  const b = new Date(otherWeekStartMonday + "T12:00:00").getTime();
  return Math.round((b - a) / (7 * 24 * 60 * 60 * 1000));
}

/** Check if an ISO timestamp falls within the week containing weekStartDate (YYYY-MM-DD, a Monday). */
export function isTimestampInWeek(isoTimestamp: string, weekStartDate: string): boolean {
  const ts = isoTimestamp.slice(0, 10);
  const start = new Date(weekStartDate + "T00:00:00").getTime();
  const end = start + 7 * 24 * 60 * 60 * 1000;
  const tsTime = new Date(ts + "T12:00:00").getTime();
  return tsTime >= start && tsTime < end;
}

/** Upcoming dates starting from tomorrow, count days. Returns YYYY-MM-DD strings. */
export function getUpcomingDates(count: number, fromDate?: string): string[] {
  const base = fromDate ? new Date(fromDate + "T12:00:00") : new Date();
  const out: string[] = [];
  for (let i = 1; i <= count; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    out.push(toLocalDateString(d));
  }
  return out;
}
