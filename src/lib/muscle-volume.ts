/**
 * Weekly training volume per muscle group.
 *
 * Hard sets per muscle per week is the strongest single predictor of hypertrophy, and it is
 * the number lifters most often get wrong — chest and biceps drift high while hamstrings,
 * rear delts, and calves quietly starve. This module counts what was actually logged and
 * scores it against volume landmarks (MEV / MAV / MRV).
 *
 * Mirrored on iOS (`RefactorKit/Sources/Utilities/MuscleVolume.swift`) and
 * Android (`api/MuscleVolume.kt`). Keep the three in sync.
 */

import type { WorkoutExercise, WorkoutSetLog } from "./types";
import { parseSetTarget } from "./progression";

// ── Muscle groups ───────────────────────────────────────

export const MUSCLE_GROUPS = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "abs",
  "forearms",
  "traps",
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

/**
 * Weekly set landmarks per muscle group.
 *
 * - `mev` — minimum effective volume: below this, expect maintenance at best.
 * - `mav` — maximum adaptive volume: the productive middle most growth happens in.
 * - `mrv` — maximum recoverable volume: past this, fatigue outruns adaptation.
 *
 * Values follow commonly published hypertrophy landmarks for intermediate lifters.
 */
export const VOLUME_LANDMARKS: Record<MuscleGroup, { mev: number; mav: number; mrv: number }> = {
  chest: { mev: 8, mav: 16, mrv: 22 },
  back: { mev: 10, mav: 18, mrv: 25 },
  shoulders: { mev: 8, mav: 18, mrv: 26 },
  biceps: { mev: 8, mav: 16, mrv: 26 },
  triceps: { mev: 6, mav: 14, mrv: 22 },
  quads: { mev: 8, mav: 16, mrv: 20 },
  hamstrings: { mev: 6, mav: 13, mrv: 20 },
  glutes: { mev: 4, mav: 12, mrv: 16 },
  calves: { mev: 8, mav: 16, mrv: 20 },
  abs: { mev: 4, mav: 16, mrv: 25 },
  forearms: { mev: 2, mav: 10, mrv: 16 },
  traps: { mev: 4, mav: 12, mrv: 20 },
};

/** Beginners grow on less; advanced lifters need more before the same stimulus lands. */
const LEVEL_MULTIPLIER: Record<string, number> = {
  beginner: 0.7,
  intermediate: 1,
  advanced: 1.15,
  athlete: 1.15,
};

/** A secondary mover earns half credit — the convention used for hard-set counting. */
const SECONDARY_CREDIT = 0.5;

// ── Classification ──────────────────────────────────────

/**
 * ExerciseDB `targetMuscles` vocabulary → our canonical groups.
 * Anything unrecognized is dropped rather than guessed.
 */
const EXERCISEDB_ALIASES: Record<string, MuscleGroup> = {
  pectorals: "chest",
  "serratus anterior": "chest",
  lats: "back",
  "upper back": "back",
  "levator scapulae": "back",
  spine: "back",
  delts: "shoulders",
  deltoids: "shoulders",
  biceps: "biceps",
  triceps: "triceps",
  quads: "quads",
  quadriceps: "quads",
  hamstrings: "hamstrings",
  glutes: "glutes",
  adductors: "quads",
  abductors: "glutes",
  calves: "calves",
  abs: "abs",
  forearms: "forearms",
  traps: "traps",
};

/**
 * Name-based classification, used when an exercise has no tagged muscles — which is most of
 * them, since plans are generated as free text. Ordered most specific first so
 * "romanian deadlift" resolves to hamstrings before "deadlift" claims it for back.
 */
const NAME_RULES: { pattern: RegExp; primary: MuscleGroup[]; secondary?: MuscleGroup[] }[] = [
  // Hinge / posterior chain — before generic deadlift
  { pattern: /romanian|rdl|good morning|stiff.?leg/i, primary: ["hamstrings"], secondary: ["glutes", "back"] },
  { pattern: /hip thrust|glute bridge|kickback/i, primary: ["glutes"], secondary: ["hamstrings"] },
  { pattern: /leg curl|nordic|ham curl/i, primary: ["hamstrings"] },
  { pattern: /deadlift/i, primary: ["back", "hamstrings"], secondary: ["glutes", "traps", "forearms"] },

  // Squat pattern
  { pattern: /leg press|hack squat/i, primary: ["quads"], secondary: ["glutes"] },
  { pattern: /leg extension/i, primary: ["quads"] },
  { pattern: /lunge|split squat|step.?up|bulgarian/i, primary: ["quads", "glutes"], secondary: ["hamstrings"] },
  { pattern: /squat/i, primary: ["quads"], secondary: ["glutes", "hamstrings"] },

  // Vertical / horizontal pull
  { pattern: /pull.?up|chin.?up|lat pulldown|pulldown/i, primary: ["back"], secondary: ["biceps"] },
  { pattern: /face pull|rear delt|reverse fly|reverse flye/i, primary: ["shoulders"], secondary: ["back"] },
  { pattern: /row/i, primary: ["back"], secondary: ["biceps", "traps"] },
  { pattern: /pullover/i, primary: ["back"], secondary: ["chest"] },
  { pattern: /shrug/i, primary: ["traps"], secondary: ["forearms"] },

  // Press / push
  { pattern: /overhead press|shoulder press|military press|arnold press|push press/i, primary: ["shoulders"], secondary: ["triceps"] },
  { pattern: /lateral raise|side raise|front raise/i, primary: ["shoulders"] },
  { pattern: /incline (bench|press|dumbbell)/i, primary: ["chest"], secondary: ["shoulders", "triceps"] },
  { pattern: /bench press|chest press|push.?up|dip/i, primary: ["chest"], secondary: ["triceps", "shoulders"] },
  { pattern: /fly|flye|pec deck|cable crossover/i, primary: ["chest"] },

  // Arms
  { pattern: /skull.?crusher|pushdown|tricep|overhead extension|kickback/i, primary: ["triceps"] },
  { pattern: /hammer curl|preacher curl|bicep curl|curl/i, primary: ["biceps"], secondary: ["forearms"] },
  { pattern: /wrist curl|farmer|grip/i, primary: ["forearms"] },

  // Core / calves
  { pattern: /calf|calve/i, primary: ["calves"] },
  { pattern: /plank|crunch|sit.?up|leg raise|hanging|russian twist|ab wheel|dead bug|hollow/i, primary: ["abs"] },
];

export interface MuscleAttribution {
  primary: MuscleGroup[];
  secondary: MuscleGroup[];
}

const EMPTY_ATTRIBUTION: MuscleAttribution = { primary: [], secondary: [] };

/** Map tagged muscle strings (ExerciseDB vocabulary) onto canonical groups. */
export function normalizeTaggedMuscles(muscles: string[] | undefined): MuscleGroup[] {
  if (!muscles || muscles.length === 0) return [];
  const out = new Set<MuscleGroup>();
  for (const raw of muscles) {
    const key = raw.trim().toLowerCase();
    const mapped = EXERCISEDB_ALIASES[key];
    if (mapped) out.add(mapped);
    else if ((MUSCLE_GROUPS as readonly string[]).includes(key)) out.add(key as MuscleGroup);
  }
  return Array.from(out);
}

/**
 * Which muscles an exercise trains. Prefers tagged muscles from ExerciseDB; otherwise
 * falls back to matching the name. Returns empty when nothing matches, so unknown
 * movements are excluded rather than misattributed.
 */
export function classifyExercise(
  exerciseName: string,
  taggedMuscles?: string[],
): MuscleAttribution {
  const tagged = normalizeTaggedMuscles(taggedMuscles);
  if (tagged.length > 0) {
    // Tagged data has no primary/secondary split; treat the first as primary.
    return { primary: [tagged[0]], secondary: tagged.slice(1) };
  }

  const name = exerciseName.trim();
  if (!name) return EMPTY_ATTRIBUTION;

  for (const rule of NAME_RULES) {
    if (rule.pattern.test(name)) {
      return { primary: rule.primary, secondary: rule.secondary ?? [] };
    }
  }
  return EMPTY_ATTRIBUTION;
}

// ── Weekly volume ───────────────────────────────────────

export type VolumeStatus = "under" | "optimal" | "high" | "over";

export interface MuscleVolumeEntry {
  muscle: MuscleGroup;
  /** Hard sets, primary at full credit and secondary at half. */
  sets: number;
  landmarks: { mev: number; mav: number; mrv: number };
  status: VolumeStatus;
  /** Sets to reach MEV; 0 when already at or above it. */
  setsToMev: number;
}

export interface WeeklyVolumeSummary {
  weekStart: string;
  entries: MuscleVolumeEntry[];
  /** Groups below MEV — the actionable list. */
  underdosed: MuscleGroup[];
  /** Groups above MRV — recoverability risk. */
  overdosed: MuscleGroup[];
  totalHardSets: number;
  /** Exercise names that could not be classified, so gaps are explainable. */
  unclassifiedExercises: string[];
}

function scaleLandmarks(
  landmarks: { mev: number; mav: number; mrv: number },
  fitnessLevel?: string,
): { mev: number; mav: number; mrv: number } {
  const multiplier = LEVEL_MULTIPLIER[fitnessLevel ?? "intermediate"] ?? 1;
  if (multiplier === 1) return landmarks;
  return {
    mev: Math.round(landmarks.mev * multiplier),
    mav: Math.round(landmarks.mav * multiplier),
    mrv: Math.round(landmarks.mrv * multiplier),
  };
}

function statusFor(sets: number, l: { mev: number; mav: number; mrv: number }): VolumeStatus {
  if (sets < l.mev) return "under";
  if (sets > l.mrv) return "over";
  if (sets > l.mav) return "high";
  return "optimal";
}

export interface WeeklyVolumeOptions {
  /** Scales landmarks by training age. */
  fitnessLevel?: string;
  /** Tagged muscles per exercise name (lowercased), from the plan. */
  muscleLookup?: Record<string, string[]>;
}

/**
 * Count hard sets per muscle across a 7-day window starting at `weekStart`.
 * Warmup sets are excluded; a set counts once it has reps logged.
 */
export function computeWeeklyVolume(
  setLogs: WorkoutSetLog[],
  weekStart: string,
  options: WeeklyVolumeOptions = {},
): WeeklyVolumeSummary {
  const start = new Date(weekStart + "T00:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  const totals = new Map<MuscleGroup, number>();
  const unclassified = new Set<string>();
  let totalHardSets = 0;

  for (const log of setLogs) {
    if (log.section === "warmup") continue;
    if (log.reps == null || log.reps <= 0) continue;

    const logDate = new Date(log.date + "T00:00:00");
    if (logDate < start || logDate >= end) continue;

    totalHardSets += 1;

    const tagged = options.muscleLookup?.[log.exerciseName.trim().toLowerCase()];
    const { primary, secondary } = classifyExercise(log.exerciseName, tagged);

    if (primary.length === 0) {
      unclassified.add(log.exerciseName.trim());
      continue;
    }
    for (const muscle of primary) {
      totals.set(muscle, (totals.get(muscle) ?? 0) + 1);
    }
    for (const muscle of secondary) {
      totals.set(muscle, (totals.get(muscle) ?? 0) + SECONDARY_CREDIT);
    }
  }

  const entries: MuscleVolumeEntry[] = MUSCLE_GROUPS.map((muscle) => {
    const sets = Math.round((totals.get(muscle) ?? 0) * 2) / 2;
    const landmarks = scaleLandmarks(VOLUME_LANDMARKS[muscle], options.fitnessLevel);
    return {
      muscle,
      sets,
      landmarks,
      status: statusFor(sets, landmarks),
      setsToMev: Math.max(0, Math.ceil(landmarks.mev - sets)),
    };
  });

  return {
    weekStart,
    entries,
    underdosed: entries.filter((e) => e.status === "under").map((e) => e.muscle),
    overdosed: entries.filter((e) => e.status === "over").map((e) => e.muscle),
    totalHardSets,
    unclassifiedExercises: Array.from(unclassified),
  };
}

/**
 * Planned weekly volume from the program itself, before anything is logged.
 * Lets the app flag an unbalanced plan on day one rather than four weeks in.
 */
export function computePlannedVolume(
  exercisesByDay: WorkoutExercise[][],
  options: WeeklyVolumeOptions = {},
): MuscleVolumeEntry[] {
  const totals = new Map<MuscleGroup, number>();

  for (const day of exercisesByDay) {
    for (const exercise of day) {
      const setCount = parseSetTarget(exercise.sets);
      const { primary, secondary } = classifyExercise(exercise.name, exercise.muscles);
      for (const muscle of primary) {
        totals.set(muscle, (totals.get(muscle) ?? 0) + setCount);
      }
      for (const muscle of secondary) {
        totals.set(muscle, (totals.get(muscle) ?? 0) + setCount * SECONDARY_CREDIT);
      }
    }
  }

  return MUSCLE_GROUPS.map((muscle) => {
    const sets = Math.round((totals.get(muscle) ?? 0) * 2) / 2;
    const landmarks = scaleLandmarks(VOLUME_LANDMARKS[muscle], options.fitnessLevel);
    return {
      muscle,
      sets,
      landmarks,
      status: statusFor(sets, landmarks),
      setsToMev: Math.max(0, Math.ceil(landmarks.mev - sets)),
    };
  });
}

/** Human-readable label, e.g. "hamstrings" → "Hamstrings". */
export function muscleLabel(muscle: MuscleGroup): string {
  return muscle.charAt(0).toUpperCase() + muscle.slice(1);
}

/** Tagged-muscle lookup keyed by lowercased exercise name, built from a plan. */
export function buildMuscleLookup(exercisesByDay: WorkoutExercise[][]): Record<string, string[]> {
  const lookup: Record<string, string[]> = {};
  for (const day of exercisesByDay) {
    for (const exercise of day) {
      if (!exercise.muscles || exercise.muscles.length === 0) continue;
      lookup[exercise.name.trim().toLowerCase()] = exercise.muscles;
    }
  }
  return lookup;
}
