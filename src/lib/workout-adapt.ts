import { invokeNova } from "./nova";
import type { WorkoutDay, WorkoutExercise, WorkoutEquipment } from "./types";
import {
  incompatibleReason,
  isExerciseCompatible,
  resolveAvailableEquipment,
} from "./exercise-equipment";
import {
  applyReplacementToExercise,
  bumpSubstitutionUseCount,
  getLearnedReplacement,
} from "./exercise-substitutions";
import { findCatalogSubstitution } from "./exercise-catalog-substitutions";
import type {
  ExerciseSubstitutionPreference,
  UserProfile,
  WorkoutAdaptResult,
  WorkoutAdaptSection,
  WorkoutAdaptSwap,
} from "./types";

export interface AdaptWorkoutProfileContext {
  workoutLocation?: UserProfile["workoutLocation"];
  workoutEquipment?: WorkoutEquipment[];
  injuriesOrLimitations?: string[];
}

export interface AdaptWorkoutOptions {
  useLlm?: boolean;
  dayLabel?: string;
}

interface PendingSwap {
  section: WorkoutAdaptSection;
  index: number;
  exercise: WorkoutExercise;
}

function collectSection(
  day: WorkoutDay,
  section: WorkoutAdaptSection
): WorkoutExercise[] {
  if (section === "warmups") return day.warmups ?? [];
  if (section === "finishers") return day.finishers ?? [];
  return day.exercises;
}

function setSection(
  day: WorkoutDay,
  section: WorkoutAdaptSection,
  exercises: WorkoutExercise[]
): WorkoutDay {
  if (section === "warmups") return { ...day, warmups: exercises };
  if (section === "finishers") return { ...day, finishers: exercises };
  return { ...day, exercises };
}

function listPendingIncompatible(
  day: WorkoutDay,
  available: WorkoutEquipment[]
): PendingSwap[] {
  const sections: WorkoutAdaptSection[] = ["warmups", "exercises", "finishers"];
  const pending: PendingSwap[] = [];
  for (const section of sections) {
    const list = collectSection(day, section);
    list.forEach((exercise, index) => {
      if (!isExerciseCompatible(exercise.name, available)) {
        pending.push({ section, index, exercise });
      }
    });
  }
  return pending;
}

function applySwapToDay(
  day: WorkoutDay,
  swap: WorkoutAdaptSwap
): WorkoutDay {
  const list = [...collectSection(day, swap.section)];
  const current = list[swap.index];
  if (!current) return day;
  list[swap.index] = applyReplacementToExercise(current, swap.replacement);
  return setSection(day, swap.section, list);
}

export async function adaptWorkoutDay(
  day: WorkoutDay,
  profile: AdaptWorkoutProfileContext,
  learned: ExerciseSubstitutionPreference[],
  options: AdaptWorkoutOptions = {}
): Promise<{ day: WorkoutDay; swaps: WorkoutAdaptSwap[]; stats: Omit<WorkoutAdaptResult, "workout" | "days" | "swaps"> }> {
  const available = resolveAvailableEquipment(profile.workoutLocation, profile.workoutEquipment);
  let adapted: WorkoutDay = {
    ...day,
    warmups: day.warmups ?? [],
    finishers: day.finishers ?? [],
  };
  const swaps: WorkoutAdaptSwap[] = [];
  let learnedApplied = 0;
  let catalogApplied = 0;
  let llmApplied = 0;

  let pending = listPendingIncompatible(adapted, available);
  let preferences = [...learned];

  for (const item of pending) {
    const learnedPref = getLearnedReplacement(item.exercise.name, preferences);
    if (learnedPref) {
      const swap: WorkoutAdaptSwap = {
        dayLabel: options.dayLabel ?? day.day,
        section: item.section,
        index: item.index,
        original: item.exercise.name,
        replacement: learnedPref.replacement,
        reason: learnedPref.reason ?? "Your saved substitution",
        source: "learned",
      };
      swaps.push(swap);
      adapted = applySwapToDay(adapted, swap);
      preferences = bumpSubstitutionUseCount(preferences, item.exercise.name);
      learnedApplied++;
    }
  }

  pending = listPendingIncompatible(adapted, available).filter(
    (p) => !swaps.some((s) => s.section === p.section && s.index === p.index)
  );

  for (const item of pending) {
    const catalog = findCatalogSubstitution(item.exercise.name, available);
    if (catalog) {
      const swap: WorkoutAdaptSwap = {
        dayLabel: options.dayLabel ?? day.day,
        section: item.section,
        index: item.index,
        original: item.exercise.name,
        replacement: catalog.replacement,
        reason: catalog.reason,
        source: "catalog",
      };
      swaps.push(swap);
      adapted = applySwapToDay(adapted, swap);
      catalogApplied++;
    }
  }

  pending = listPendingIncompatible(adapted, available).filter(
    (p) => !swaps.some((s) => s.section === p.section && s.index === p.index)
  );

  if (pending.length > 0 && options.useLlm !== false) {
    const llmSwaps = await suggestLlmSubstitutions(pending, profile, available);
    for (const swap of llmSwaps) {
      swaps.push({ ...swap, dayLabel: options.dayLabel ?? day.day });
      adapted = applySwapToDay(adapted, swap);
      if (swap.source === "llm") llmApplied++;
    }
  }

  for (const item of listPendingIncompatible(adapted, available)) {
    if (swaps.some((s) => s.section === item.section && s.index === item.index)) continue;
    swaps.push({
      dayLabel: options.dayLabel ?? day.day,
      section: item.section,
      index: item.index,
      original: item.exercise.name,
      replacement: item.exercise.name,
      reason: incompatibleReason(item.exercise.name, available),
      source: "none",
    });
  }

  return {
    day: adapted,
    swaps,
    stats: { learnedApplied, catalogApplied, llmApplied },
  };
}

export async function adaptWorkoutProgram(
  days: WorkoutDay[],
  profile: AdaptWorkoutProfileContext,
  learned: ExerciseSubstitutionPreference[],
  options: { useLlm?: boolean } = {}
): Promise<WorkoutAdaptResult> {
  const adaptedDays: WorkoutDay[] = [];
  const allSwaps: WorkoutAdaptSwap[] = [];
  let learnedApplied = 0;
  let catalogApplied = 0;
  let llmApplied = 0;

  for (const day of days) {
    const result = await adaptWorkoutDay(day, profile, learned, {
      useLlm: options.useLlm,
      dayLabel: day.day,
    });
    adaptedDays.push(result.day);
    allSwaps.push(...result.swaps);
    learnedApplied += result.stats.learnedApplied;
    catalogApplied += result.stats.catalogApplied;
    llmApplied += result.stats.llmApplied;
  }

  return {
    days: adaptedDays,
    swaps: allSwaps,
    learnedApplied,
    catalogApplied,
    llmApplied,
  };
}

async function suggestLlmSubstitutions(
  pending: PendingSwap[],
  profile: AdaptWorkoutProfileContext,
  available: WorkoutEquipment[]
): Promise<WorkoutAdaptSwap[]> {
  if (pending.length === 0) return [];

  const equipmentList = available.map((e) => e.replace(/_/g, " ")).join(", ");
  const injuries =
    profile.injuriesOrLimitations && profile.injuriesOrLimitations.length > 0
      ? profile.injuriesOrLimitations.join("; ")
      : "none";

  const items = pending.map((p) => ({
    section: p.section,
    index: p.index,
    name: p.exercise.name,
    sets: p.exercise.sets,
    reps: p.exercise.reps,
  }));

  const system = `You substitute exercises for home/gym equipment constraints. Return ONLY valid JSON: {"substitutions":[{"index":0,"section":"exercises","replacement":"Name","reason":"short reason"}]}. Use index and section from the input list position (0-based within pending batch). Keep sets/reps intent similar. Only use available equipment.`;

  const user = JSON.stringify({
    availableEquipment: equipmentList,
    injuriesOrLimitations: injuries,
    exercises: items,
  });

  try {
    const raw = await invokeNova(system, user, { maxTokens: 1200 });
    const parsed = parseLlmSubstitutionJson(raw);
    const swaps: WorkoutAdaptSwap[] = [];
    for (let i = 0; i < pending.length; i++) {
      const item = pending[i];
      const match =
        parsed.find((p) => p.index === i && p.section === item.section) ??
        parsed.find((p) => p.index === i) ??
        parsed[i];
      if (!match?.replacement) continue;
      swaps.push({
        section: item.section,
        index: item.index,
        original: item.exercise.name,
        replacement: match.replacement.trim(),
        reason: match.reason?.trim() || "Adapted for your equipment",
        source: "llm",
      });
    }
    return swaps;
  } catch {
    return [];
  }
}

function parseLlmSubstitutionJson(
  raw: string
): Array<{ index: number; section: WorkoutAdaptSection; replacement: string; reason?: string }> {
  let text = raw.replace(/^[\s\S]*?```(?:json)?\s*\n?/i, "").replace(/\n?```[\s\S]*$/i, "").trim();
  const start = text.indexOf("{");
  if (start >= 0) text = text.slice(start);
  const parsed = JSON.parse(text) as {
    substitutions?: Array<{
      index?: number;
      section?: string;
      replacement?: string;
      reason?: string;
    }>;
  };
  if (!Array.isArray(parsed.substitutions)) return [];
  return parsed.substitutions
    .filter((s) => typeof s.replacement === "string" && s.replacement.trim().length > 0)
    .map((s, fallbackIndex) => ({
      index: typeof s.index === "number" ? s.index : fallbackIndex,
      section: normalizeSection(s.section),
      replacement: s.replacement!.trim(),
      reason: s.reason,
    }));
}

function normalizeSection(value: string | undefined): WorkoutAdaptSection {
  if (value === "warmups" || value === "finishers") return value;
  return "exercises";
}

export async function adaptImportedWorkout(
  input: { workout?: WorkoutDay; days?: WorkoutDay[] },
  profile: AdaptWorkoutProfileContext,
  learned: ExerciseSubstitutionPreference[],
  options: { useLlm?: boolean } = {}
): Promise<WorkoutAdaptResult> {
  if (input.days && input.days.length > 0) {
    return adaptWorkoutProgram(input.days, profile, learned, options);
  }
  if (input.workout) {
    const result = await adaptWorkoutDay(input.workout, profile, learned, options);
    return {
      workout: result.day,
      swaps: result.swaps,
      ...result.stats,
    };
  }
  return { swaps: [], learnedApplied: 0, catalogApplied: 0, llmApplied: 0 };
}
