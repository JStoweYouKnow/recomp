/**
 * Canonical rep-count correction for the 12-Week Clear Muscle Challenge
 * (Muscle & Strength). The PDF parser extracts exercise names correctly but
 * misreads the glued number columns. This module applies ground-truth
 * sets/reps/rest for every week × day combination, keyed by exercise position
 * within the session.
 *
 * Source: 12-Week Clear Muscle Challenge PDF (Muscle & Strength).
 */

import type { WorkoutDay, WorkoutExercise } from "@/lib/types";

interface ExercisePatch {
  /** 0-based index into the exercises array. -1 = apply to ALL exercises. */
  index: number;
  sets: string;
  reps: string;
  notes: string;
}

interface DayScheme {
  focus: string;
  patches: ExercisePatch[];
}

/** All exercises on a day share the same scheme. */
function uniform(
  focus: string,
  sets: string,
  reps: string,
  notes: string
): DayScheme {
  return { focus, patches: [{ index: -1, sets, reps, notes }] };
}

/** Each patch targets the exercise at the specified 0-based position. */
function perExercise(focus: string, patches: Omit<ExercisePatch, never>[]): DayScheme {
  return { focus, patches };
}

// ---------------------------------------------------------------------------
// Ground-truth scheme table
// Key format: "DayName — Week N"  (matches the session keys produced by the parser)
// ---------------------------------------------------------------------------

const SCHEME: Record<string, DayScheme> = {
  // ── Phase 1: Weeks 1–4 ──────────────────────────────────────────────────

  // Week 1
  "Monday — Week 1": uniform("Hypertrophy", "3", "12", "60s rest"),
  "Wednesday — Week 1": uniform("Strength", "5", "5", "3 min rest"),
  "Friday — Week 1": perExercise("Strength", [
    { index: 0, sets: "5", reps: "5", notes: "3 min rest" },
    { index: 1, sets: "5", reps: "5", notes: "3 min rest" },
    { index: 2, sets: "5", reps: "5", notes: "3 min rest" },
    { index: 3, sets: "3", reps: "5", notes: "3 min rest" },
    { index: 4, sets: "3", reps: "5", notes: "3 min rest" },
    { index: 5, sets: "3", reps: "5", notes: "3 min rest" },
    { index: 6, sets: "3", reps: "5", notes: "3 min rest" },
    { index: 7, sets: "3", reps: "5", notes: "3 min rest" },
  ]),

  // Week 2
  "Monday — Week 2": uniform("Hypertrophy", "3", "10", "60s rest"),
  "Wednesday — Week 2": uniform("Strength", "5", "4", "3 min rest"),
  "Friday — Week 2": perExercise("Strength", [
    { index: 0, sets: "5", reps: "4", notes: "3 min rest" },
    { index: 1, sets: "5", reps: "4", notes: "3 min rest" },
    { index: 2, sets: "5", reps: "4", notes: "3 min rest" },
    { index: 3, sets: "3", reps: "4", notes: "3 min rest" },
    { index: 4, sets: "3", reps: "4", notes: "3 min rest" },
    { index: 5, sets: "3", reps: "4", notes: "3 min rest" },
    { index: 6, sets: "3", reps: "4", notes: "3 min rest" },
    { index: 7, sets: "3", reps: "4", notes: "3 min rest" },
  ]),

  // Week 3 (identical to Week 2)
  "Monday — Week 3": uniform("Hypertrophy", "3", "10", "60s rest"),
  "Wednesday — Week 3": uniform("Strength", "5", "4", "3 min rest"),
  "Friday — Week 3": perExercise("Strength", [
    { index: 0, sets: "5", reps: "4", notes: "3 min rest" },
    { index: 1, sets: "5", reps: "4", notes: "3 min rest" },
    { index: 2, sets: "5", reps: "4", notes: "3 min rest" },
    { index: 3, sets: "3", reps: "4", notes: "3 min rest" },
    { index: 4, sets: "3", reps: "4", notes: "3 min rest" },
    { index: 5, sets: "3", reps: "4", notes: "3 min rest" },
    { index: 6, sets: "3", reps: "4", notes: "3 min rest" },
    { index: 7, sets: "3", reps: "4", notes: "3 min rest" },
  ]),

  // Week 4 (deload)
  "Monday — Week 4": uniform("Hypertrophy (Deload)", "3", "8", "120s rest"),
  "Wednesday — Week 4": uniform("Strength (Deload)", "5", "3", "3 min rest"),
  "Friday — Week 4": uniform("Strength (Deload)", "3", "1", "3 min rest"),

  // ── Phase 2: Weeks 5–8 ──────────────────────────────────────────────────
  // Monday: 3 exercise groups with descending set counts (accumulation)

  // Week 5
  "Monday — Week 5": perExercise("Hypertrophy", [
    { index: 0, sets: "3", reps: "12", notes: "60s rest" },
    { index: 1, sets: "2", reps: "12", notes: "60s rest" },
    { index: 2, sets: "1", reps: "12", notes: "60s rest" },
    { index: 3, sets: "3", reps: "12", notes: "60s rest" },
    { index: 4, sets: "2", reps: "12", notes: "60s rest" },
    { index: 5, sets: "1", reps: "12", notes: "60s rest" },
    { index: 6, sets: "3", reps: "12", notes: "60s rest" },
    { index: 7, sets: "2", reps: "12", notes: "60s rest" },
    { index: 8, sets: "1", reps: "12", notes: "60s rest" },
  ]),
  "Wednesday — Week 5": perExercise("Strength", [
    { index: 0, sets: "5", reps: "3", notes: "3 min rest" },  // Squats
    { index: 1, sets: "5", reps: "5", notes: "3 min rest" },  // Bench
    { index: 2, sets: "3", reps: "5", notes: "3 min rest" },  // Sumo Deadlift
    { index: 3, sets: "2", reps: "5", notes: "3 min rest" },  // Conv Deadlift
    { index: 4, sets: "3", reps: "5", notes: "3 min rest" },
    { index: 5, sets: "2", reps: "5", notes: "3 min rest" },
    { index: 6, sets: "2", reps: "5", notes: "3 min rest" },
    { index: 7, sets: "2", reps: "5", notes: "3 min rest" },
  ]),
  "Friday — Week 5": perExercise("Strength", [
    { index: 0, sets: "5", reps: "5", notes: "3 min rest" },
    { index: 1, sets: "2", reps: "5", notes: "3 min rest" },
    { index: 2, sets: "1", reps: "5", notes: "3 min rest" },
    { index: 3, sets: "3", reps: "5", notes: "3 min rest" },
    { index: 4, sets: "3", reps: "5", notes: "3 min rest" },
    { index: 5, sets: "3", reps: "5", notes: "3 min rest" },
    { index: 6, sets: "3", reps: "5", notes: "3 min rest" },
    { index: 7, sets: "3", reps: "5", notes: "3 min rest" },
  ]),

  // Week 6
  "Monday — Week 6": perExercise("Hypertrophy", [
    { index: 0, sets: "3", reps: "10", notes: "60s rest" },
    { index: 1, sets: "2", reps: "10", notes: "60s rest" },
    { index: 2, sets: "1", reps: "10", notes: "60s rest" },
    { index: 3, sets: "3", reps: "10", notes: "60s rest" },
    { index: 4, sets: "2", reps: "10", notes: "60s rest" },
    { index: 5, sets: "1", reps: "10", notes: "60s rest" },
    { index: 6, sets: "3", reps: "10", notes: "60s rest" },
    { index: 7, sets: "2", reps: "10", notes: "60s rest" },
    { index: 8, sets: "1", reps: "10", notes: "60s rest" },
  ]),
  "Wednesday — Week 6": perExercise("Strength", [
    { index: 0, sets: "5", reps: "4", notes: "3 min rest" },
    { index: 1, sets: "3", reps: "4", notes: "3 min rest" },
    { index: 2, sets: "2", reps: "4", notes: "3 min rest" },
    { index: 3, sets: "3", reps: "4", notes: "3 min rest" },
    { index: 4, sets: "2", reps: "4", notes: "3 min rest" },
    { index: 5, sets: "2", reps: "4", notes: "3 min rest" },
    { index: 6, sets: "2", reps: "4", notes: "3 min rest" },
    { index: 7, sets: "2", reps: "4", notes: "3 min rest" },
  ]),
  "Friday — Week 6": perExercise("Strength", [
    { index: 0, sets: "5", reps: "4", notes: "3 min rest" },
    { index: 1, sets: "2", reps: "4", notes: "3 min rest" },
    { index: 2, sets: "1", reps: "4", notes: "3 min rest" },
    { index: 3, sets: "3", reps: "4", notes: "3 min rest" },
    { index: 4, sets: "3", reps: "4", notes: "3 min rest" },
    { index: 5, sets: "3", reps: "4", notes: "3 min rest" },
    { index: 6, sets: "3", reps: "4", notes: "3 min rest" },
    { index: 7, sets: "3", reps: "4", notes: "3 min rest" },
  ]),

  // Week 7
  "Monday — Week 7": perExercise("Hypertrophy", [
    { index: 0, sets: "3", reps: "10", notes: "90s rest" },
    { index: 1, sets: "2", reps: "10", notes: "90s rest" },
    { index: 2, sets: "1", reps: "10", notes: "90s rest" },
    { index: 3, sets: "3", reps: "10", notes: "90s rest" },
    { index: 4, sets: "2", reps: "10", notes: "90s rest" },
    { index: 5, sets: "1", reps: "10", notes: "90s rest" },
    { index: 6, sets: "3", reps: "10", notes: "90s rest" },
    { index: 7, sets: "2", reps: "10", notes: "90s rest" },
    { index: 8, sets: "1", reps: "10", notes: "90s rest" },
  ]),
  "Wednesday — Week 7": perExercise("Strength", [
    { index: 0, sets: "5", reps: "4", notes: "3 min rest" },
    { index: 1, sets: "3", reps: "4", notes: "3 min rest" },
    { index: 2, sets: "2", reps: "5", notes: "3 min rest" },
    { index: 3, sets: "3", reps: "4", notes: "3 min rest" },
    { index: 4, sets: "2", reps: "4", notes: "3 min rest" },
    { index: 5, sets: "2", reps: "5", notes: "3 min rest" },
    { index: 6, sets: "2", reps: "5", notes: "3 min rest" },
    { index: 7, sets: "2", reps: "5", notes: "3 min rest" },
  ]),
  "Friday — Week 7": perExercise("Strength", [
    { index: 0, sets: "5", reps: "3", notes: "3 min rest" },
    { index: 1, sets: "2", reps: "3", notes: "3 min rest" },
    { index: 2, sets: "1", reps: "3", notes: "3 min rest" },
    { index: 3, sets: "3", reps: "3", notes: "3 min rest" },
    { index: 4, sets: "3", reps: "3", notes: "3 min rest" },
    { index: 5, sets: "3", reps: "3", notes: "3 min rest" },
    { index: 6, sets: "3", reps: "3", notes: "3 min rest" },
    { index: 7, sets: "3", reps: "3", notes: "3 min rest" },
  ]),

  // Week 8 (deload)
  "Monday — Week 8": perExercise("Hypertrophy (Deload)", [
    { index: 0, sets: "3", reps: "8", notes: "120s rest" },
    { index: 1, sets: "2", reps: "8", notes: "120s rest" },
    { index: 2, sets: "1", reps: "8", notes: "120s rest" },
    { index: 3, sets: "3", reps: "8", notes: "120s rest" },
    { index: 4, sets: "2", reps: "8", notes: "120s rest" },
    { index: 5, sets: "1", reps: "8", notes: "120s rest" },
    { index: 6, sets: "3", reps: "8", notes: "120s rest" },
    { index: 7, sets: "2", reps: "8", notes: "120s rest" },
    { index: 8, sets: "1", reps: "8", notes: "120s rest" },
  ]),
  "Wednesday — Week 8": perExercise("Strength (Deload)", [
    { index: 0, sets: "5", reps: "3", notes: "3 min rest" },
    { index: 1, sets: "3", reps: "3", notes: "3 min rest" },
    { index: 2, sets: "2", reps: "3", notes: "3 min rest" },
    { index: 3, sets: "3", reps: "3", notes: "3 min rest" },
    { index: 4, sets: "2", reps: "3", notes: "3 min rest" },
    { index: 5, sets: "2", reps: "3", notes: "3 min rest" },
    { index: 6, sets: "2", reps: "3", notes: "3 min rest" },
    { index: 7, sets: "2", reps: "3", notes: "3 min rest" },
  ]),
  "Friday — Week 8": uniform("Strength (Deload)", "3", "1", "5 min rest"),

  // ── Phase 2 cont: Weeks 9–10 (6 days/week) ──────────────────────────────
  // Parser only handles Mon/Wed/Fri by default; Tue/Thu/Sat added here.

  "Monday — Week 9":    uniform("Strength", "3", "8", "3 min rest"),
  "Tuesday — Week 9":   uniform("Hypertrophy", "3", "8", "60s rest"),
  "Wednesday — Week 9": uniform("Strength", "3", "12", "60s rest"),
  "Thursday — Week 9":  uniform("Hypertrophy", "3", "12", "60s rest"),
  "Friday — Week 9":    uniform("Strength (Max Effort)", "3", "1", "5 min rest"),
  "Saturday — Week 9":  uniform("Conditioning (Wingates)", "2", "1", "Full recovery"),

  "Monday — Week 10":    uniform("Strength", "3", "8", "3 min rest"),
  "Tuesday — Week 10":   uniform("Hypertrophy", "3", "8", "60s rest"),
  "Wednesday — Week 10": uniform("Strength", "3", "12", "60s rest"),
  "Thursday — Week 10":  uniform("Hypertrophy", "3", "12", "60s rest"),
  "Friday — Week 10":    uniform("Strength (Max Effort)", "3", "1", "5 min rest"),
  "Saturday — Week 10":  uniform("Conditioning (Wingates)", "2", "1", "Full recovery"),

  // ── Phase 3: Weeks 11–12 (taper) ────────────────────────────────────────

  // Week 11
  "Monday — Week 11": uniform("Strength", "5", "5", "3 min rest"),
  "Wednesday — Week 11": perExercise("Strength (Taper)", [
    { index: 0, sets: "3", reps: "3-5", notes: "4 min rest" },
    { index: 1, sets: "3", reps: "3-5", notes: "4 min rest" },
    { index: 2, sets: "3", reps: "3-5", notes: "4 min rest" },
    // Accessories: 1 set each
    { index: 3, sets: "1", reps: "3-5", notes: "4 min rest" },
    { index: 4, sets: "1", reps: "3-5", notes: "4 min rest" },
    { index: 5, sets: "1", reps: "3-5", notes: "4 min rest" },
    { index: 6, sets: "1", reps: "3-5", notes: "4 min rest" },
    { index: 7, sets: "1", reps: "3-5", notes: "4 min rest" },
  ]),
  "Friday — Week 11": uniform("Strength", "5", "5", "3 min rest"),

  // Week 12
  "Monday — Week 12": perExercise("Strength (Taper)", [
    { index: 0, sets: "3", reps: "3-5", notes: "4 min rest" },
    { index: 1, sets: "3", reps: "3-5", notes: "4 min rest" },
    { index: 2, sets: "3", reps: "3-5", notes: "4 min rest" },
    { index: 3, sets: "1", reps: "3-5", notes: "4 min rest" },
    { index: 4, sets: "1", reps: "3-5", notes: "4 min rest" },
    { index: 5, sets: "1", reps: "3-5", notes: "4 min rest" },
    { index: 6, sets: "1", reps: "3-5", notes: "4 min rest" },
    { index: 7, sets: "1", reps: "3-5", notes: "4 min rest" },
  ]),
  "Wednesday — Week 12": uniform("Strength", "5", "5", "3 min rest"),
  "Friday — Week 12": uniform("Strength (Peak)", "3", "1", "5 min rest"),
};

/**
 * Apply ground-truth rep corrections to a parsed Clear Muscle program.
 * Exercise names are kept as-is; only sets/reps/notes are patched.
 */
export function correctClearMuscleReps(days: WorkoutDay[]): WorkoutDay[] {
  return days.map((day) => {
    const scheme = SCHEME[day.day];
    if (!scheme) return day;

    const patchedExercises = applyPatches(day.exercises, scheme.patches);
    return {
      ...day,
      focus: scheme.focus,
      exercises: patchedExercises,
    };
  });
}

function applyPatches(
  exercises: WorkoutExercise[],
  patches: ExercisePatch[]
): WorkoutExercise[] {
  if (exercises.length === 0) return exercises;

  // Check if all patches target -1 (uniform)
  const uniformPatch = patches.find((p) => p.index === -1);
  if (uniformPatch) {
    return exercises.map((ex) => ({
      ...ex,
      sets: uniformPatch.sets,
      reps: uniformPatch.reps,
      notes: uniformPatch.notes,
    }));
  }

  // Per-position patches: only patch exercises that have a matching index entry.
  // Exercises beyond the last defined patch index keep their parsed values.
  const byIndex = new Map(patches.map((p) => [p.index, p]));
  return exercises.map((ex, i) => {
    const patch = byIndex.get(i);
    if (!patch) return ex;
    return {
      ...ex,
      sets: patch.sets,
      reps: patch.reps,
      notes: patch.notes,
    };
  });
}
