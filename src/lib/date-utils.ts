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
