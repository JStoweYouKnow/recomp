import { describe, it, expect } from "vitest";
import { normalizeMenuItems, rankMenuItems } from "./menu-fit";

const item = (name: string, calories: number, protein: number, carbs = 40, fat = 15) => ({
  name,
  estimatedMacros: { calories, protein, carbs, fat },
});

describe("menu-fit", () => {
  it("approves high-protein items that fit and sorts them first", () => {
    const ranked = rankMenuItems(
      [item("Loaded nachos", 1400, 35, 120, 80), item("Chicken bowl", 560, 48), item("Side salad", 180, 4, 12, 10)],
      { calories: 750, protein: 60, carbs: 80, fat: 25 },
      { goal: "build_muscle" }
    );
    expect(ranked[0].name).toBe("Chicken bowl");
    expect(ranked[0].recommended).toBe(true);
    expect(ranked.find((r) => r.name === "Loaded nachos")?.recommended).toBe(false);
  });

  it("caps approvals and approves nothing when the budget is spent", () => {
    const items = Array.from({ length: 6 }, (_, i) => item(`Bowl ${i}`, 550 + i * 10, 45));
    const budget = { calories: 800, protein: 80, carbs: 90, fat: 30 };
    expect(rankMenuItems(items, budget, { goal: "build_muscle" }).filter((r) => r.recommended)).toHaveLength(3);
    expect(
      rankMenuItems(items, { calories: 0, protein: 0, carbs: 0, fat: 0 }, { goal: "build_muscle" }).some((r) => r.recommended)
    ).toBe(false);
  });

  it("normalizes loose model output", () => {
    expect(
      normalizeMenuItems([
        { name: " Burrito ", calories: "910", protein: 45.6, carbs: 100, fat: 30, source: "official" },
        { name: "", estimatedMacros: { calories: 100 } },
        null,
      ])
    ).toEqual([
      {
        name: "Burrito",
        description: null,
        estimatedMacros: { calories: 910, protein: 46, carbs: 100, fat: 30 },
        confidence: undefined,
        source: "official",
      },
    ]);
  });
});
