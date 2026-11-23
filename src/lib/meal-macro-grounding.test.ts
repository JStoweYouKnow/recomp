import { describe, expect, it } from "vitest";
import { exactCommonFood, groundLogMealActions } from "./meal-macro-grounding";

describe("exactCommonFood", () => {
  it("uses the USDA serving for a counted staple", () => {
    const egg = exactCommonFood("2 eggs");
    expect(egg?.calories).toBe(156);
    expect(egg?.protein).toBe(12);
  });

  it("does not treat a composed meal as a single staple", () => {
    expect(exactCommonFood("chipotle chicken burrito")).toBeNull();
    expect(exactCommonFood("chicken caesar salad")).toBeNull();
  });
});

describe("groundLogMealActions", () => {
  it("replaces guessed macros with the lookup", async () => {
    const actions = [
      {
        type: "log_meal",
        payload: { name: "Chipotle chicken burrito", calories: 400, protein: 20, carbs: 30, fat: 10 },
      },
    ];
    const notes = await groundLogMealActions(actions, async () => ({
      calories: 665,
      protein: 32,
      carbs: 64,
      fat: 24,
      source: "web-grounding",
    }));
    expect(actions[0].payload.calories).toBe(665);
    expect(actions[0].payload.protein).toBe(32);
    expect(notes[0]).toContain("665 cal");
  });
});
