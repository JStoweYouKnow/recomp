import type { WorkoutDay, WorkoutExercise } from "@/lib/types";

const DAY_HEADER =
  /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*:\s*(.*)$/i;

const CLEAR_MUSCLE_WEEKDAYS = new Set(["Monday", "Wednesday", "Friday"]);
const WEEK_HEADER = /^Week\s+(\d+)\s*$/i;
const SKIP_LINE =
  /^(ExerciseSetsRepsRest|Superset|MUSCLEANDSTRENGTH|THE TOOLS|THE 12-WEEK|PHASE\s+\d|Main Goal:|Training Level:|Program Duration:|Days Per Week:|Time Per Workout:|Equipment:|Author:|Link to Workout|Paired with|workouts\/|StoreWorkouts)/i;

/** Glued table row: Name + sets + reps + "60 Secs" or Name + sets + reps + "3 Mins" (power/strength). */
function parseExerciseGlued(full: string): WorkoutExercise | null {
  const line = full.replace(/\s+/g, " ").trim();
  if (!line || line.length < 4) return null;

  const mins = line.match(/^(.+?)(\d)(\d)(\d)\s*Mins\s*$/i);
  if (mins) {
    const name = mins[1].trim();
    if (name.length < 2) return null;
    const sets = mins[2];
    const reps = mins[3];
    const rm = mins[4];
    return {
      name,
      sets,
      reps,
      notes: `${rm} min rest`,
    };
  }

  const secs = line.match(/^(.+?)(\d{1,2})(\d{1,3})(\d{2,4})\s*Secs\s*$/i);
  if (secs) {
    const name = secs[1].trim();
    if (name.length < 2) return null;
    const sets = secs[2];
    const reps = secs[3];
    const rest = secs[4];
    return {
      name,
      sets,
      reps,
      notes: `${rest}s rest`,
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

/**
 * Deterministic parse for Muscle & Strength "Clear Muscle" style PDFs:
 * Week N → Monday/Wednesday/Friday blocks with glued "Name31260 Secs" / "553 Mins" rows.
 * Returns null if the text does not look like this format.
 */
export function parseClearMuscleStyleProgram(text: string): {
  programTitle?: string;
  days: WorkoutDay[];
} | null {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let currentWeek: number | null = null;
  let currentDay: string | null = null;
  let currentFocus = "";
  let pendingName = "";

  /** One entry per "Monday — Week N" etc.; later duplicate blocks in the PDF replace earlier. */
  const sessions = new Map<string, WorkoutDay>();
  let exercises: WorkoutExercise[] = [];

  const flushSession = () => {
    if (currentWeek !== null && currentDay && exercises.length > 0) {
      const key = `${currentDay} — Week ${currentWeek}`;
      sessions.set(key, {
        day: key,
        focus: currentFocus.trim() || `${currentDay} session`,
        exercises: [...exercises],
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

    const wm = trimmed.match(WEEK_HEADER);
    if (wm) {
      flushSession();
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

    if (currentWeek === null || !currentDay) continue;
    if (isFooterOrNoise(trimmed)) {
      pendingName = "";
      continue;
    }

    if (/^superset$/i.test(trimmed)) continue;

    const looksLikeExerciseTail = /\d{1,2}\d{1,3}\d{2,4}\s*Secs\s*$/i.test(trimmed) ||
      /\d\d\d\s*Mins\s*$/i.test(trimmed);

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
