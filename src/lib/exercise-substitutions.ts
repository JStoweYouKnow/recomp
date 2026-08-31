import type { ExerciseSubstitutionPreference, WorkoutExercise } from "./types";
import { normalizeExerciseKey } from "./exercise-equipment";

export function normalizeSubstitutionKey(name: string): string {
  return normalizeExerciseKey(name);
}

export function getLearnedReplacement(
  exerciseName: string,
  preferences: ExerciseSubstitutionPreference[]
): ExerciseSubstitutionPreference | null {
  const key = normalizeSubstitutionKey(exerciseName);
  const exact = preferences.find((p) => p.normalizedOriginal === key);
  if (exact) return exact;

  return (
    preferences.find(
      (p) => key.includes(p.normalizedOriginal) || p.normalizedOriginal.includes(key)
    ) ?? null
  );
}

export function recordSubstitution(
  existing: ExerciseSubstitutionPreference[],
  input: {
    original: string;
    replacement: string;
    reason?: string;
    source?: ExerciseSubstitutionPreference["source"];
  }
): ExerciseSubstitutionPreference[] {
  const normalizedOriginal = normalizeSubstitutionKey(input.original);
  const replacement = input.replacement.trim();
  if (!normalizedOriginal || !replacement) return existing;

  const now = new Date().toISOString();
  const idx = existing.findIndex((p) => p.normalizedOriginal === normalizedOriginal);

  if (idx >= 0) {
    const prev = existing[idx];
    const next = [...existing];
    next[idx] = {
      ...prev,
      original: input.original.trim() || prev.original,
      replacement,
      reason: input.reason ?? prev.reason,
      learnedAt: now,
      useCount: prev.useCount + 1,
      source: input.source ?? prev.source,
    };
    return next;
  }

  return [
    ...existing,
    {
      original: input.original.trim(),
      normalizedOriginal,
      replacement,
      reason: input.reason,
      learnedAt: now,
      useCount: 1,
      source: input.source ?? "import",
    },
  ];
}

export function recordSubstitutionsBatch(
  existing: ExerciseSubstitutionPreference[],
  items: Array<{
    original: string;
    replacement: string;
    reason?: string;
    source?: ExerciseSubstitutionPreference["source"];
  }>
): ExerciseSubstitutionPreference[] {
  return items.reduce((acc, item) => recordSubstitution(acc, item), existing);
}

export function bumpSubstitutionUseCount(
  preferences: ExerciseSubstitutionPreference[],
  exerciseName: string
): ExerciseSubstitutionPreference[] {
  const key = normalizeSubstitutionKey(exerciseName);
  return preferences.map((p) =>
    p.normalizedOriginal === key ? { ...p, useCount: p.useCount + 1 } : p
  );
}

export function applyReplacementToExercise(
  exercise: WorkoutExercise,
  replacement: string
): WorkoutExercise {
  if (exercise.name.trim().toLowerCase() === replacement.trim().toLowerCase()) {
    return exercise;
  }
  const note = exercise.notes?.trim();
  const swapNote = `Swapped from ${exercise.name}`;
  return {
    ...exercise,
    name: replacement.trim(),
    notes: note ? `${note} · ${swapNote}` : swapNote,
  };
}
