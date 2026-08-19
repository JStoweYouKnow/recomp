import { describe, it, expect } from "vitest";
import { recommendFromMemory } from "./meal-recommendations";
import type { MealEntry, Macros } from "./types";

const targets: Macros = { calories: 2000, protein: 150, carbs: 200, fat: 65 };

function meal(
  name: string,
  macros: Macros,
  mealType: MealEntry["mealType"] = "lunch",
  daysAgo = 1,
): MealEntry {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const date = d.toISOString().slice(0, 10);
  return {
    id: `${name}-${date}`,
    date,
    mealType,
    name,
    macros,
    loggedAt: d.toISOString(),
  };
}

describe("recommendFromMemory", () => {
  it("ranks frequent history items that fit remaining macros", () => {
    const history = [
      ...Array.from({ length: 5 }, () =>
        meal("Chicken rice bowl", { calories: 520, protein: 42, carbs: 48, fat: 14 }),
      ),
      ...Array.from({ length: 3 }, () =>
        meal("Greek yogurt", { calories: 150, protein: 18, carbs: 12, fat: 3 }, "snack"),
      ),
    ];
    const consumed: Macros = { calories: 900, protein: 60, carbs: 80, fat: 25 };

    const { meals, snacks } = recommendFromMemory({
      meals: history,
      targets,
      consumed,
    });

    expect(meals.length).toBeGreaterThan(0);
    expect(meals[0]?.name).toBe("Chicken rice bowl");
    expect(snacks.some((s) => s.name === "Greek yogurt")).toBe(true);
  });

  it("separates snacks from meals by calories and meal type", () => {
    const history = [
      meal("Protein bar", { calories: 200, protein: 20, carbs: 22, fat: 6 }, "snack", 0),
      meal("Protein bar", { calories: 200, protein: 20, carbs: 22, fat: 6 }, "snack", 2),
      meal("Steak dinner", { calories: 680, protein: 55, carbs: 20, fat: 38 }, "dinner", 1),
      meal("Steak dinner", { calories: 680, protein: 55, carbs: 20, fat: 38 }, "dinner", 3),
    ];

    const { meals, snacks } = recommendFromMemory({
      meals: history,
      targets,
      consumed: { calories: 0, protein: 0, carbs: 0, fat: 0 },
    });

    expect(meals.every((m) => m.category === "meal")).toBe(true);
    expect(snacks.every((s) => s.category === "snack")).toBe(true);
  });

  it("includes saved recipes when includeRecipes is true", () => {
    const { meals } = recommendFromMemory({
      meals: [],
      savedRecipes: [
        {
          id: "r1",
          name: "Overnight oats",
          calories: 380,
          protein: 22,
          carbs: 52,
          fat: 10,
          mealTypes: ["breakfast"],
          source: "curated",
          addedAt: "2026-05-01T00:00:00.000Z",
        },
      ],
      targets,
      consumed: { calories: 0, protein: 0, carbs: 0, fat: 0 },
      includeRecipes: true,
    });

    expect(meals.some((m) => m.source === "saved_recipe")).toBe(true);
  });
});
