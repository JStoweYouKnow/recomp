import { describe, it, expect } from "vitest";
import { scoreRecipeFit, rankRecipes, remainingMacros } from "./recipe-fit";

describe("recipe-fit", () => {
  it("computes remaining macros", () => {
    expect(remainingMacros(
      { calories: 2000, protein: 150, carbs: 200, fat: 65 },
      { calories: 500, protein: 40 }
    )).toEqual({ calories: 1500, protein: 110, carbs: 200, fat: 65 });
  });

  it("ranks high-protein recipes higher for build_muscle", () => {
    const budget = { calories: 600, protein: 40, carbs: 60, fat: 20 };
    const ranked = rankRecipes(
      [
        { id: "1", name: "Salad", calories: 350, protein: 12, carbs: 30, fat: 10, addedAt: "" },
        { id: "2", name: "Chicken bowl", calories: 480, protein: 42, carbs: 35, fat: 14, addedAt: "" },
      ],
      budget,
      { goal: "build_muscle", limit: 2 }
    );
    expect(ranked[0].name).toBe("Chicken bowl");
    expect(ranked[0].fitScore).toBeGreaterThan(ranked[1].fitScore);
  });

  it("penalizes recipes far over calorie budget", () => {
    const { fitScore } = scoreRecipeFit(
      { name: "Feast", calories: 900, protein: 30, carbs: 80, fat: 40 },
      { calories: 400, protein: 30, carbs: 40, fat: 15 },
      { goal: "lose_weight" }
    );
    expect(fitScore).toBeLessThan(50);
  });
});
