import { describe, it, expect } from "vitest";
import { applyRicoActionsToState } from "./rico-actions";
import type { FitnessPlan, MealEntry } from "./types";

const basePlan: FitnessPlan = {
  id: "plan-1",
  createdAt: new Date().toISOString(),
  dietPlan: {
    dailyTargets: { calories: 2000, protein: 150, carbs: 200, fat: 65 },
    trainingTargets: { calories: 2200, protein: 160, carbs: 220, fat: 70 },
    restTargets: { calories: 1900, protein: 140, carbs: 180, fat: 60 },
    weeklyPlan: [],
    tips: [],
  },
  workoutPlan: {
    weeklyPlan: [
      {
        day: "Monday",
        focus: "Push",
        exercises: [{ name: "Bench Press", sets: "3", reps: "8" }],
      },
    ],
    tips: [],
  },
};

describe("applyRicoActionsToState", () => {
  it("updates plan dailyTargets for update_macros", () => {
    const state = { meals: [] as MealEntry[], plan: structuredClone(basePlan) };
    const result = applyRicoActionsToState(
      [{ type: "update_macros", payload: { calories: 1800, protein: 140, carbs: 180, fat: 60 } }],
      state,
    );
    expect(result.touchedPlan).toBe(true);
    expect(result.skipped).toHaveLength(0);
    expect(state.plan?.dietPlan.dailyTargets.calories).toBe(1800);
  });

  it("logs a meal with optional mealType", () => {
    const state = { meals: [] as MealEntry[], plan: null };
    const payload: Record<string, unknown> = {
      name: "Oatmeal",
      calories: 350,
      protein: 12,
      carbs: 55,
      fat: 8,
      mealType: "breakfast",
    };
    const result = applyRicoActionsToState([{ type: "log_meal", payload }], state);
    expect(result.touchedMeals).toBe(true);
    expect(state.meals).toHaveLength(1);
    expect(state.meals[0]?.mealType).toBe("breakfast");
    expect(typeof payload.id).toBe("string");
    expect(typeof payload.date).toBe("string");
    expect(state.meals[0]?.id).toBe(payload.id);
    expect(state.meals[0]?.date).toBe(payload.date);
  });

  it("reports skipped swap when exercise is missing", () => {
    const state = { meals: [] as MealEntry[], plan: structuredClone(basePlan) };
    const result = applyRicoActionsToState(
      [
        {
          type: "swap_exercise",
          payload: {
            day: "Monday",
            oldExerciseName: "Squat",
            newExerciseName: "Leg Press",
            newSets: "3",
            newReps: "10",
          },
        },
      ],
      state,
    );
    expect(result.applied).toHaveLength(0);
    expect(result.skipped[0]?.type).toBe("swap_exercise");
  });

  it("formatRicoApplyStatus summarizes applied and skipped actions", async () => {
    const { formatRicoApplyStatus } = await import("./rico-actions");
    const status = formatRicoApplyStatus({
      changed: true,
      touchedMeals: true,
      touchedPlan: false,
      regeneratePlan: false,
      applied: ["log_meal"],
      skipped: [{ type: "swap_exercise", reason: "exercise not found" }],
    });
    expect(status).toContain("Applied 1 change(s)");
    expect(status).toContain("swap_exercise");
  });
});
