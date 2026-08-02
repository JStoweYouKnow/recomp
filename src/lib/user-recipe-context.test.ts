import { describe, it, expect } from "vitest";
import {
  buildDiscoveryParams,
  buildUserRecipeContext,
  filterAvoidRecent,
} from "./user-recipe-context";
import type { ActivityLogEntry, MealEntry, PantryItem } from "./types";

function meal(name: string, mealType: MealEntry["mealType"] = "lunch", daysAgo = 1): MealEntry {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return {
    id: `${name}-${daysAgo}`,
    date: d.toISOString().slice(0, 10),
    mealType,
    name,
    macros: { calories: 500, protein: 40, carbs: 40, fat: 15 },
    loggedAt: d.toISOString(),
  };
}

describe("buildUserRecipeContext", () => {
  it("detects frequent proteins from meal history", () => {
    const meals = [
      ...Array.from({ length: 4 }, () => meal("Grilled chicken bowl")),
      meal("Salmon salad", "dinner", 2),
    ];
    const ctx = buildUserRecipeContext({
      meals,
      date: new Date().toISOString().slice(0, 10),
      remainingCalories: 600,
      remainingProtein: 50,
      goal: "build_muscle",
    });
    expect(ctx.topProteins[0]).toBe("chicken");
  });

  it("marks training day from activity log", () => {
    const today = new Date().toISOString().slice(0, 10);
    const activityLog: ActivityLogEntry[] = [
      {
        id: "a1",
        date: today,
        type: "activity",
        label: "Leg day",
        category: "workout",
        durationMinutes: 60,
        calorieAdjustment: 200,
        loggedAt: new Date().toISOString(),
      },
    ];
    const ctx = buildUserRecipeContext({
      meals: [],
      activityLog,
      date: today,
      remainingCalories: 800,
      remainingProtein: 60,
    });
    expect(ctx.trainingDay).toBe(true);
  });

  it("includes pantry proteins in top ingredients", () => {
    const pantry: PantryItem[] = [
      { id: "1", name: "Eggs", category: "protein", addedAt: new Date().toISOString() },
      { id: "2", name: "Spinach", category: "produce", addedAt: new Date().toISOString() },
    ];
    const ctx = buildUserRecipeContext({
      meals: [],
      pantry,
      date: new Date().toISOString().slice(0, 10),
      remainingCalories: 400,
      remainingProtein: 30,
    });
    expect(ctx.pantryNames).toContain("Eggs");
    expect(ctx.topIngredients.some((i) => i.includes("egg"))).toBe(true);
  });
});

describe("buildDiscoveryParams", () => {
  it("builds query from proteins and meal type", () => {
    const params = buildDiscoveryParams({
      goal: "maintain",
      dietaryRestrictions: [],
      timeOfDay: "dinner",
      remainingCalories: 650,
      remainingProtein: 45,
      topProteins: ["salmon"],
      topIngredients: ["rice"],
      pantryNames: [],
      avoidRecent: [],
      trainingDay: false,
      activitySummary: "test",
    });
    expect(params.query).toContain("salmon");
    expect(params.query).toContain("dinner");
    expect(params.maxCalories).toBeGreaterThan(0);
  });

  it("adds post workout hint on training days", () => {
    const params = buildDiscoveryParams({
      goal: "build_muscle",
      dietaryRestrictions: [],
      timeOfDay: "dinner",
      remainingCalories: 700,
      remainingProtein: 50,
      topProteins: ["chicken"],
      topIngredients: [],
      pantryNames: [],
      avoidRecent: [],
      trainingDay: true,
      activitySummary: "training",
    });
    expect(params.query).toContain("post workout");
    expect(params.minProtein).toBeGreaterThanOrEqual(20);
  });
});

describe("filterAvoidRecent", () => {
  it("removes items matching recent meal names", () => {
    const items = [{ name: "Chicken rice bowl" }, { name: "Greek yogurt parfait" }];
    const filtered = filterAvoidRecent(items, ["Chicken rice bowl"]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.name).toBe("Greek yogurt parfait");
  });
});
