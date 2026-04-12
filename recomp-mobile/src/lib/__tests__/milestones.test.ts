import { computeMilestones, BADGE_INFO, getBadgeIcon } from "../milestones";
import type { MealEntry, FitnessPlan, Macros } from "../types";

const defaultTargets: Macros = { calories: 2000, protein: 150, carbs: 200, fat: 65 };

function makeMeal(date: string, overrides?: Partial<MealEntry>): MealEntry {
  return {
    id: `meal-${date}-${Math.random()}`,
    date,
    mealType: "lunch",
    name: "Test Meal",
    macros: { calories: 500, protein: 40, carbs: 50, fat: 15 },
    loggedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeDateRange(startDaysAgo: number, count: number): string[] {
  const dates: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - (startDaysAgo - i));
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

describe("computeMilestones", () => {
  it("returns empty milestones for no meals", () => {
    const result = computeMilestones([], null, defaultTargets, 0, false);
    expect(result.milestones).toHaveLength(0);
    expect(result.xp).toBe(0);
  });

  it("awards first_meal badge for a single meal", () => {
    const meals = [makeMeal("2025-01-15")];
    const result = computeMilestones(meals, null, defaultTargets, 0, false);
    expect(result.milestones.some((m) => m.id === "first_meal")).toBe(true);
    expect(result.xp).toBe(BADGE_INFO.first_meal.xp);
  });

  it("awards streak badges for consecutive days", () => {
    const dates = makeDateRange(6, 7); // 7 consecutive days
    const meals = dates.map((d) => makeMeal(d));
    const result = computeMilestones(meals, null, defaultTargets, 0, false);

    expect(result.milestones.some((m) => m.id === "meal_streak_3")).toBe(true);
    expect(result.milestones.some((m) => m.id === "meal_streak_7")).toBe(true);
    expect(result.milestones.some((m) => m.id === "meal_streak_14")).toBe(false);
  });

  it("awards plan_adjuster when hasAdjustedPlan is true", () => {
    const meals = [makeMeal("2025-01-15")];
    const result = computeMilestones(meals, null, defaultTargets, 0, true);
    expect(result.milestones.some((m) => m.id === "plan_adjuster")).toBe(true);
    expect(result.xp).toBeGreaterThanOrEqual(BADGE_INFO.plan_adjuster.xp);
  });

  it("awards wearable badges when wearables are connected", () => {
    const meals = [makeMeal("2025-01-15")];
    const result = computeMilestones(meals, null, defaultTargets, 2, false);
    expect(result.milestones.some((m) => m.id === "early_adopter")).toBe(true);
    expect(result.milestones.some((m) => m.id === "wearable_synced")).toBe(true);
  });

  it("tracks streak progress as percentages", () => {
    const dates = makeDateRange(1, 2); // 2 consecutive days
    const meals = dates.map((d) => makeMeal(d));
    const result = computeMilestones(meals, null, defaultTargets, 0, false);

    expect(result.progress["streak_3"]).toBeCloseTo((2 / 3) * 100, 0);
    expect(result.progress["streak_7"]).toBeCloseTo((2 / 7) * 100, 0);
  });
});

describe("getBadgeIcon", () => {
  it("returns correct icons for known badges", () => {
    expect(getBadgeIcon("first_meal")).toBe("🍽️");
    expect(getBadgeIcon("meal_streak_7")).toBe("⚡");
  });

  it("returns fallback for unknown badge", () => {
    expect(getBadgeIcon("unknown_badge")).toBe("🏅");
  });
});

describe("BADGE_INFO", () => {
  it("has xp values for all badges", () => {
    Object.values(BADGE_INFO).forEach((badge) => {
      expect(badge.xp).toBeGreaterThan(0);
      expect(badge.name).toBeTruthy();
      expect(badge.desc).toBeTruthy();
    });
  });
});
