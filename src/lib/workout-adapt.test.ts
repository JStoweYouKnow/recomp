import { describe, it, expect, vi, beforeEach } from "vitest";
import type { WorkoutDay } from "./types";
import { adaptWorkoutDay } from "./workout-adapt";

vi.mock("./nova", () => ({
  invokeNova: vi.fn(async () =>
    JSON.stringify({
      substitutions: [{ index: 0, section: "exercises", replacement: "Push-Up", reason: "No barbell" }],
    })
  ),
}));

const homeDay: WorkoutDay = {
  day: "Monday",
  focus: "Push",
  exercises: [
    { name: "Barbell Bench Press", sets: "3", reps: "10" },
    { name: "Push-Up", sets: "3", reps: "15" },
  ],
};

describe("workout-adapt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applies catalog substitution for incompatible exercises", async () => {
    const result = await adaptWorkoutDay(
      homeDay,
      { workoutLocation: "home", workoutEquipment: ["bodyweight", "resistance_bands"] },
      [],
      { useLlm: false }
    );
    const benchSwap = result.swaps.find((s) => s.original.includes("Bench"));
    expect(benchSwap?.replacement).toBe("Push-Up");
    expect(benchSwap?.source).toBe("catalog");
    expect(result.day.exercises[0].name).toBe("Push-Up");
  });

  it("prefers learned substitutions over catalog", async () => {
    const result = await adaptWorkoutDay(
      homeDay,
      { workoutLocation: "home", workoutEquipment: ["bodyweight"] },
      [
        {
          original: "Barbell Bench Press",
          normalizedOriginal: "barbell bench press",
          replacement: "Floor Press",
          learnedAt: new Date().toISOString(),
          useCount: 3,
          source: "import",
        },
      ],
      { useLlm: false }
    );
    expect(result.swaps[0].source).toBe("learned");
    expect(result.swaps[0].replacement).toBe("Floor Press");
    expect(result.stats.learnedApplied).toBe(1);
  });
});
