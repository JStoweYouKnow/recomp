import type { WorkoutDay, WorkoutExercise } from "@/lib/types";

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

/** Parse one M&S-style `<table class="workoutTable">` inner HTML. */
export function parseWorkoutTableInner(inner: string): WorkoutDay | null {
  let day = "Imported";
  let focus = "Imported workout";

  const firstRow = /<tr[^>]*>([\s\S]*?)<\/tr>/i.exec(inner);
  if (firstRow?.[1]?.includes("<th")) {
    const ths = [...firstRow[1].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((x) =>
      decodeHtmlEntities(stripTags(x[1])).trim()
    );
    const headerLabel = ths[0] ?? "";
    if (headerLabel && !/^sets$/i.test(headerLabel)) {
      const paren = headerLabel.match(/\(([^)]+)\)\s*$/);
      if (paren) {
        day = headerLabel.replace(/\s*\([^)]+\)\s*$/, "").trim() || day;
        focus = paren[1].trim() || focus;
      } else {
        day = headerLabel.slice(0, 120);
        if (ths.length >= 2 && ths[1] && !/^reps$/i.test(ths[1])) {
          focus = ths[1].slice(0, 120);
        }
      }
    }
  }

  const exercises: WorkoutExercise[] = [];
  const rowRe =
    /<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(inner)) !== null) {
    const name = decodeHtmlEntities(stripTags(rm[1])).trim();
    const sets = stripTags(rm[2]).trim();
    const reps = stripTags(rm[3]).trim();
    if (!name || name.length > 400) continue;
    if (/^sets$/i.test(name) && /^reps$/i.test(reps)) continue;
    if (!/\d/.test(sets) && !/^\d/.test(reps)) continue;
    exercises.push({
      name,
      sets: sets || "3",
      reps: reps || "10",
    });
  }

  if (exercises.length === 0) return null;
  return { day, focus, exercises };
}

/** All `<table class="workoutTable">` blocks on a page (e.g. muscleandstrength.com programs). */
export function parseAllWorkoutTablesFromHtml(html: string): WorkoutDay[] {
  const re = /<table[^>]*class=["'][^"']*\bworkoutTable\b[^"']*["'][^>]*>([\s\S]*?)<\/table>/gi;
  const days: WorkoutDay[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const day = parseWorkoutTableInner(m[1]);
    if (day) days.push(day);
  }
  return days;
}

export function extractProgramTitleFromHtml(html: string): string | undefined {
  const og = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(html);
  if (og?.[1]) {
    const t = decodeHtmlEntities(og[1]).trim();
    if (t) return t.replace(/\s*[-|]\s*Muscle\s*&\s*Strength.*$/i, "").trim() || t;
  }
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (h1?.[1]) {
    const t = decodeHtmlEntities(stripTags(h1[1])).trim();
    if (t) return t;
  }
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (title?.[1]) {
    const t = decodeHtmlEntities(stripTags(title[1])).trim();
    if (t) return t.replace(/\s*[-|]\s*Muscle\s*&\s*Strength.*$/i, "").trim() || t;
  }
  return undefined;
}

export type WorkoutTablesPayload = {
  workout: WorkoutDay;
  days?: WorkoutDay[];
  programTitle?: string;
  dayCount: number;
  source: string;
};

export function buildWorkoutTablesPayload(
  days: WorkoutDay[],
  source: string,
  programTitle?: string
): WorkoutTablesPayload | null {
  if (days.length === 0) return null;
  const base = { programTitle, source, dayCount: days.length, workout: days[0] };
  if (days.length > 1) return { ...base, days };
  return base;
}
