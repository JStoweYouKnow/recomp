import type { WorkoutEquipment } from "./types";
import { normalizeExerciseKey } from "./exercise-equipment";

export interface CatalogSubstitution {
  replacement: string;
  reason: string;
  requires: WorkoutEquipment[];
}

/** Equipment-aware catalog swaps tried before LLM. Keys are normalized phrases. */
export const CATALOG_SUBSTITUTIONS: Record<string, CatalogSubstitution[]> = {
  "lat pulldown": [
    { replacement: "Resistance Band Pulldown", reason: "No cable machine", requires: ["resistance_bands"] },
    { replacement: "Dumbbell Row", reason: "No cable machine", requires: ["free_weights"] },
    { replacement: "Inverted Row", reason: "No cable machine", requires: ["bodyweight", "pull_up_bar"] },
  ],
  "cable lat pulldown": [
    { replacement: "Resistance Band Pulldown", reason: "No cable machine", requires: ["resistance_bands"] },
    { replacement: "Dumbbell Row", reason: "No cable machine", requires: ["free_weights"] },
  ],
  "seated cable row": [
    { replacement: "Dumbbell Row", reason: "No cable machine", requires: ["free_weights"] },
    { replacement: "Band Row", reason: "No cable machine", requires: ["resistance_bands"] },
  ],
  "leg press": [
    { replacement: "Goblet Squat", reason: "No leg press", requires: ["free_weights", "kettlebells"] },
    { replacement: "Bodyweight Squat", reason: "No leg press", requires: ["bodyweight"] },
  ],
  "leg extension": [
    { replacement: "Bulgarian Split Squat", reason: "No leg extension machine", requires: ["bodyweight", "free_weights"] },
  ],
  "leg curl": [
    { replacement: "Romanian Deadlift", reason: "No leg curl machine", requires: ["barbells", "free_weights"] },
    { replacement: "Glute Bridge", reason: "No leg curl machine", requires: ["bodyweight"] },
  ],
  "barbell bench press": [
    { replacement: "Push-Up", reason: "No barbell", requires: ["bodyweight"] },
    { replacement: "Dumbbell Bench Press", reason: "No barbell", requires: ["free_weights"] },
  ],
  "barbell squat": [
    { replacement: "Goblet Squat", reason: "No barbell", requires: ["free_weights", "kettlebells"] },
    { replacement: "Bodyweight Squat", reason: "No barbell", requires: ["bodyweight"] },
  ],
  "barbell deadlift": [
    { replacement: "Dumbbell Romanian Deadlift", reason: "No barbell", requires: ["free_weights"] },
    { replacement: "Kettlebell Deadlift", reason: "No barbell", requires: ["kettlebells"] },
  ],
  "smith machine squat": [
    { replacement: "Goblet Squat", reason: "No Smith machine", requires: ["free_weights", "kettlebells"] },
    { replacement: "Bodyweight Squat", reason: "No Smith machine", requires: ["bodyweight"] },
  ],
  "pec deck": [
    { replacement: "Push-Up", reason: "No pec deck", requires: ["bodyweight"] },
    { replacement: "Dumbbell Fly", reason: "No pec deck", requires: ["free_weights"] },
  ],
  "chest press machine": [
    { replacement: "Push-Up", reason: "No chest press machine", requires: ["bodyweight"] },
    { replacement: "Dumbbell Bench Press", reason: "No chest press machine", requires: ["free_weights"] },
  ],
  "pull up": [
    { replacement: "Band-Assisted Pull-Up", reason: "No pull-up bar", requires: ["resistance_bands"] },
    { replacement: "Inverted Row", reason: "No pull-up bar", requires: ["bodyweight"] },
  ],
  "chin up": [
    { replacement: "Band-Assisted Chin-Up", reason: "No pull-up bar", requires: ["resistance_bands"] },
    { replacement: "Dumbbell Row", reason: "No pull-up bar", requires: ["free_weights"] },
  ],
  "tricep pushdown": [
    { replacement: "Overhead Tricep Extension", reason: "No cable", requires: ["free_weights"] },
    { replacement: "Diamond Push-Up", reason: "No cable", requires: ["bodyweight"] },
  ],
  "face pull": [
    { replacement: "Band Pull-Apart", reason: "No cable", requires: ["resistance_bands"] },
    { replacement: "Rear Delt Fly", reason: "No cable", requires: ["free_weights"] },
  ],
};

export function findCatalogSubstitution(
  exerciseName: string,
  available: WorkoutEquipment[]
): CatalogSubstitution | null {
  const key = normalizeExerciseKey(exerciseName);
  const candidates = CATALOG_SUBSTITUTIONS[key] ?? findPartialCatalog(key);
  for (const candidate of candidates) {
    if (candidate.requires.some((r) => available.includes(r))) {
      return candidate;
    }
  }
  return null;
}

function findPartialCatalog(key: string): CatalogSubstitution[] {
  for (const [phrase, subs] of Object.entries(CATALOG_SUBSTITUTIONS)) {
    if (key.includes(phrase) || phrase.includes(key)) return subs;
  }
  return [];
}
