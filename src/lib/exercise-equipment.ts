import type { WorkoutEquipment, WorkoutLocation } from "./types";

/** Normalize exercise names for equipment lookup and substitution keys. */
export function normalizeExerciseKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ALL_EQUIPMENT: WorkoutEquipment[] = [
  "bodyweight",
  "free_weights",
  "barbells",
  "kettlebells",
  "machines",
  "resistance_bands",
  "cardio_machines",
  "pull_up_bar",
  "cable_machine",
];

/** Static map: normalized exercise phrase → required equipment (any one suffices). */
const EXERCISE_EQUIPMENT: Record<string, WorkoutEquipment[]> = {
  "lat pulldown": ["cable_machine", "machines"],
  "cable lat pulldown": ["cable_machine"],
  "seated cable row": ["cable_machine"],
  "cable row": ["cable_machine"],
  "cable fly": ["cable_machine"],
  "cable crossover": ["cable_machine"],
  "tricep pushdown": ["cable_machine"],
  "rope pushdown": ["cable_machine"],
  "face pull": ["cable_machine", "resistance_bands"],
  "leg press": ["machines"],
  "hack squat": ["machines", "barbells"],
  "leg extension": ["machines"],
  "leg curl": ["machines"],
  "seated leg curl": ["machines"],
  "lying leg curl": ["machines"],
  "smith machine squat": ["machines", "barbells"],
  "smith machine bench press": ["machines", "barbells", "free_weights"],
  "pec deck": ["machines"],
  "chest press machine": ["machines"],
  "shoulder press machine": ["machines"],
  "barbell bench press": ["barbells", "free_weights"],
  "barbell squat": ["barbells"],
  "barbell deadlift": ["barbells"],
  "barbell row": ["barbells", "free_weights"],
  "barbell curl": ["barbells", "free_weights"],
  "overhead press": ["barbells", "free_weights"],
  "dumbbell bench press": ["free_weights"],
  "dumbbell row": ["free_weights"],
  "dumbbell shoulder press": ["free_weights"],
  "dumbbell curl": ["free_weights"],
  "dumbbell lunges": ["free_weights", "bodyweight"],
  "goblet squat": ["free_weights", "kettlebells"],
  "kettlebell swing": ["kettlebells"],
  "kettlebell goblet squat": ["kettlebells"],
  "pull up": ["pull_up_bar", "bodyweight"],
  "pull-up": ["pull_up_bar", "bodyweight"],
  "chin up": ["pull_up_bar", "bodyweight"],
  "chin-up": ["pull_up_bar", "bodyweight"],
  "push up": ["bodyweight"],
  "push-up": ["bodyweight"],
  "bodyweight squat": ["bodyweight"],
  "air squat": ["bodyweight"],
  "plank": ["bodyweight"],
  "burpee": ["bodyweight"],
  "jumping jack": ["bodyweight"],
  "mountain climber": ["bodyweight"],
  "treadmill run": ["cardio_machines"],
  "stationary bike": ["cardio_machines"],
  "rowing machine": ["cardio_machines", "machines"],
  "elliptical": ["cardio_machines"],
  "band pull apart": ["resistance_bands"],
  "band row": ["resistance_bands"],
  "band squat": ["resistance_bands", "bodyweight"],
};

const KEYWORD_EQUIPMENT: Array<{ pattern: RegExp; equipment: WorkoutEquipment[] }> = [
  { pattern: /\bcable\b/, equipment: ["cable_machine"] },
  { pattern: /\bmachine\b/, equipment: ["machines"] },
  { pattern: /\bsmith\b/, equipment: ["machines", "barbells"] },
  { pattern: /\bbarbell\b/, equipment: ["barbells"] },
  { pattern: /\bdumbbell\b|\bdb\b/, equipment: ["free_weights"] },
  { pattern: /\bkettlebell\b|\bkb\b/, equipment: ["kettlebells"] },
  { pattern: /\bband\b|\bresistance band\b/, equipment: ["resistance_bands"] },
  { pattern: /\btreadmill\b|\bbike\b|\belliptical\b|\brower\b/, equipment: ["cardio_machines"] },
  { pattern: /\bpull[- ]?up\b|\bchin[- ]?up\b/, equipment: ["pull_up_bar", "bodyweight"] },
  { pattern: /\bpush[- ]?up\b|\bplank\b|\bsquat\b|\blunge\b|\bburpee\b/, equipment: ["bodyweight", "free_weights"] },
];

export function getRequiredEquipment(exerciseName: string): WorkoutEquipment[] {
  const key = normalizeExerciseKey(exerciseName);
  if (EXERCISE_EQUIPMENT[key]) return EXERCISE_EQUIPMENT[key];

  for (const [phrase, equipment] of Object.entries(EXERCISE_EQUIPMENT)) {
    if (key.includes(phrase) || phrase.includes(key)) return equipment;
  }

  for (const { pattern, equipment } of KEYWORD_EQUIPMENT) {
    if (pattern.test(key)) return equipment;
  }

  return ["bodyweight", "free_weights"];
}

export function resolveAvailableEquipment(
  location: WorkoutLocation | undefined,
  declared: WorkoutEquipment[] | undefined
): WorkoutEquipment[] {
  if (declared && declared.length > 0) return [...new Set(declared)];
  if (location === "gym") return ALL_EQUIPMENT;
  if (location === "outside") return ["bodyweight", "pull_up_bar", "resistance_bands", "kettlebells"];
  return ["bodyweight", "resistance_bands", "free_weights"];
}

export function isExerciseCompatible(
  exerciseName: string,
  available: WorkoutEquipment[]
): boolean {
  const required = getRequiredEquipment(exerciseName);
  return required.some((r) => available.includes(r));
}

export function incompatibleReason(
  exerciseName: string,
  available: WorkoutEquipment[]
): string {
  const required = getRequiredEquipment(exerciseName);
  const missing = required.filter((r) => !available.includes(r));
  if (missing.length === 0) return "Not compatible with your equipment";
  const labels = missing.map(formatEquipmentLabel).join(", ");
  return `Requires ${labels}`;
}

function formatEquipmentLabel(eq: WorkoutEquipment): string {
  return eq.replace(/_/g, " ");
}
