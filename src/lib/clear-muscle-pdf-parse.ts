import type { WorkoutDay, WorkoutExercise } from "@/lib/types";

/** "Monday: Hypertrophy" or "Monday" alone (phase 3 PDF). */
const DAY_HEADER =
  /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)(?:\s*:\s*(.*))?$/i;

const CLEAR_MUSCLE_WEEKDAYS = new Set(["Monday", "Wednesday", "Friday"]);

/** "Week 11" */
const WEEK_SINGLE = /^Week\s+(\d+)\s*$/i;
/** "Weeks 9 & 10" / "Week 9-10" */
const WEEK_COMBINED = /^Weeks?\s+(\d+)\s*(?:&|and|,|\/|\s*-\s*)\s*(\d+)\s*$/i;

const SKIP_LINE =
  /^(ExerciseSetsRepsRest|Superset|MUSCLEANDSTRENGTH|THE TOOLS|THE 12-WEEK|PHASE\s+\d|Main Goal:|Training Level:|Program Duration:|Days Per Week:|Time Per Workout:|Equipment:|Author:|Link to Workout|Paired with|workouts\/|StoreWorkouts)/i;

function parseExerciseGlued(full: string): WorkoutExercise | null {
  const line = full.replace(/\s+/g, " ").trim();
  if (!line || line.length < 4) return null;

  const mins = line.match(/^(.+?)(\d)(\d)(\d)\s*Mins\s*$/i);
  if (mins) {
    const name = mins[1].trim();
    if (name.length < 2) return null;
    return {
      name,
      sets: mins[2],
      reps: mins[3],
      notes: `${mins[4]} min rest`,
    };
  }

  /** e.g. Squats33 - 5240 Secs → sets 3, reps 3–5, 240s rest; Deadlifts13 - 5240 → 1, 3–5, 240s */
  const hyphen = line.match(/^(.+?)(\d)(\d)\s*-\s*(\d)\s*(\d{3})\s*Secs\s*$/i);
  if (hyphen) {
    const name = hyphen[1].trim();
    if (name.length < 2) return null;
    return {
      name,
      sets: hyphen[2],
      reps: `${hyphen[3]}-${hyphen[4]}`,
      notes: `${hyphen[5]}s rest`,
    };
  }

  /** e.g. Squats55180 Secs → 5×5, 180s rest */
  const secs553 = line.match(/^(.+?)(\d)(\d)(\d{3})\s*Secs\s*$/i);
  if (secs553) {
    const name = secs553[1].trim();
    if (name.length < 2) return null;
    return {
      name,
      sets: secs553[2],
      reps: secs553[3],
      notes: `${secs553[4]}s rest`,
    };
  }

  const secs = line.match(/^(.+?)(\d{1,2})(\d{1,3})(\d{2,4})\s*Secs\s*$/i);
  if (secs) {
    const name = secs[1].trim();
    if (name.length < 2) return null;
    return {
      name,
      sets: secs[2],
      reps: secs[3],
      notes: `${secs[4]}s rest`,
    };
  }

  return null;
}

function isFooterOrNoise(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (SKIP_LINE.test(t)) return true;
  if (/^https?:\/\//i.test(t)) return true;
  if (t.length < 3) return true;
  return false;
}

function flushWeeks(weekTargets: number[] | null, currentWeek: number | null): number[] {
  if (weekTargets?.length) return weekTargets;
  if (currentWeek != null) return [currentWeek];
  return [];
}

/**
 * Deterministic parse for Muscle & Strength "Clear Muscle" style PDFs:
 * Week N / Weeks N & M → Monday/Wednesday/Friday blocks; glued exercise rows.
 */
export function parseClearMuscleStyleProgram(text: string): {
  programTitle?: string;
  days: WorkoutDay[];
} | null {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let currentWeek: number | null = null;
  /** When set (e.g. [9, 10]), each flush writes the same session to every listed program week. */
  let weekTargets: number[] | null = null;
  let currentDay: string | null = null;
  let currentFocus = "";
  let pendingName = "";

  const sessions = new Map<string, WorkoutDay>();
  let exercises: WorkoutExercise[] = [];

  const flushSession = () => {
    const weeks = flushWeeks(weekTargets, currentWeek);
    if (!currentDay || weeks.length === 0 || exercises.length === 0) {
      exercises = [];
      return;
    }
    const snapshot = exercises.map((e) => ({ ...e }));
    for (const w of weeks) {
      const key = `${currentDay} — Week ${w}`;
      sessions.set(key, {
        day: key,
        focus: currentFocus.trim() || `${currentDay} session`,
        exercises: [...snapshot],
      });
    }
    exercises = [];
  };

  const tryParseExerciseLine = (raw: string) => {
    const combined = (pendingName + raw).replace(/\s+/g, " ").trim();
    pendingName = "";
    const ex = parseExerciseGlued(combined);
    if (ex) exercises.push(ex);
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    const wCombined = trimmed.match(WEEK_COMBINED);
    if (wCombined) {
      flushSession();
      const a = parseInt(wCombined[1], 10);
      const b = parseInt(wCombined[2], 10);
      weekTargets = [a, b];
      currentWeek = a;
      currentDay = null;
      currentFocus = "";
      pendingName = "";
      continue;
    }

    const wm = trimmed.match(WEEK_SINGLE);
    if (wm) {
      flushSession();
      weekTargets = null;
      currentWeek = parseInt(wm[1], 10);
      currentDay = null;
      currentFocus = "";
      pendingName = "";
      continue;
    }

    const dm = trimmed.match(DAY_HEADER);
    if (dm) {
      flushSession();
      const wd = dm[1].charAt(0).toUpperCase() + dm[1].slice(1).toLowerCase();
      currentFocus = (dm[2] ?? "").trim();
      pendingName = "";
      if (!CLEAR_MUSCLE_WEEKDAYS.has(wd)) {
        currentDay = null;
        continue;
      }
      currentDay = wd;
      continue;
    }

    if (currentWeek === null && !weekTargets?.length) continue;
    if (!currentDay) continue;
    if (isFooterOrNoise(trimmed)) {
      pendingName = "";
      continue;
    }

    if (/^superset$/i.test(trimmed)) continue;

    const looksLikeExerciseTail =
      /\d\s*-\s*\d.*Secs/i.test(trimmed) ||
      /\d{4,6}\s*Secs/i.test(trimmed) ||
      /\d{1,2}\d{1,3}\d{2,4}\s*Secs/i.test(trimmed) ||
      /\d\d\d\s*Mins/i.test(trimmed);

    if (looksLikeExerciseTail) {
      tryParseExerciseLine(trimmed);
    } else {
      pendingName += (pendingName ? " " : "") + trimmed;
    }
  }

  flushSession();

  const dayOrder = (label: string): number => {
    if (/^monday\b/i.test(label)) return 0;
    if (/^wednesday\b/i.test(label)) return 1;
    if (/^friday\b/i.test(label)) return 2;
    return 9;
  };
  const weekNum = (label: string): number => {
    const m = label.match(/Week\s+(\d+)/i);
    return m ? parseInt(m[1], 10) : 0;
  };

  const days = [...sessions.values()].sort((a, b) => {
    const wA = weekNum(a.day);
    const wB = weekNum(b.day);
    if (wA !== wB) return wA - wB;
    return dayOrder(a.day) - dayOrder(b.day);
  });

  if (days.length < 6) return null;
  const wed = days.filter((d) => /^wednesday\b/i.test(d.day)).length;
  const fri = days.filter((d) => /^friday\b/i.test(d.day)).length;
  const mon = days.filter((d) => /^monday\b/i.test(d.day)).length;
  if (wed < 2 || fri < 2) return null;
  if (mon > 0 && wed + fri < mon * 0.5) return null;

  return {
    programTitle: "12-Week Clear Muscle Challenge",
    days,
  };
}
