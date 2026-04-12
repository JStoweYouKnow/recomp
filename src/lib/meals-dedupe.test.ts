import { describe, it, expect } from "vitest";
import { dedupeMealsByDateAndId } from "./meals-dedupe";
import type { MealEntry } from "./types";

describe("dedupeMealsByDateAndId", () => {
  it("keeps one row per date+id", () => {
    const base: MealEntry = {
      id: "same-id",
      date: "2026-04-11",
      mealType: "lunch",
      name: "omurice",
      macros: { calories: 450, protein: 20, carbs: 50, fat: 15 },
      loggedAt: "2026-04-11T12:00:00.000Z",
    };
    const dup = { ...base, name: "omurice (dup)" };
    const out = dedupeMealsByDateAndId([base, dup]);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("omurice");
  });

  it("keeps different ids on same day", () => {
    const a: MealEntry = {
      id: "a",
      date: "2026-04-11",
      mealType: "snack",
      name: "banana",
      macros: { calories: 105, protein: 1, carbs: 27, fat: 0 },
      loggedAt: "2026-04-11T08:00:00.000Z",
    };
    const b: MealEntry = { ...a, id: "b", name: "half banana", macros: { ...a.macros, calories: 45 } };
    const out = dedupeMealsByDateAndId([a, b]);
    expect(out).toHaveLength(2);
  });
});
