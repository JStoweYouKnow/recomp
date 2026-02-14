import { describe, it, expect } from "vitest";
import {
  computeMilestones,
  getBadgeInfo,
  xpToLevel,
  xpForNextLevel,
} from "./milestones";
import type { MealEntry, Macros } from "./types";

function makeMeal(date: string, macros: Macros = { calories: 2000, protein: 150, carbs: 200, fat: 65 }): MealEntry {
  return {
    id: `m-${date}`,
    date,
    mealType: "lunch",
    name: "Test",
    macros,
    loggedAt: new Date().toISOString(),
  };
}

describe("xpToLevel", () => {
  it("returns 1 for 0 XP", () => {
    expect(xpToLevel(0)).toBe(1);
  });
  it("returns 1 for 99 XP", () => {
    expect(xpToLevel(99)).toBe(1);
  });
  it("returns 2 for 100 XP", () => {
    expect(xpToLevel(100)).toBe(2);
  });
  it("returns 2 for 399 XP", () => {
    expect(xpToLevel(399)).toBe(2);
  });
  it("returns 3 for 400 XP", () => {
    expect(xpToLevel(400)).toBe(3);
  });
});

describe("xpForNextLevel", () => {
  it("returns 100 for 0 XP (need 100 for level 2)", () => {
    expect(xpForNextLevel(0)).toBe(100);
  });
  it("returns 75 for 25 XP", () => {
    expect(xpForNextLevel(25)).toBe(75);
  });
});

describe("getBadgeInfo", () => {
  it("returns all badge definitions", () => {
    const info = getBadgeInfo();
    expect(info.first_meal).toEqual({ name: "First Bite", desc: "Logged your first meal", xp: 25 });
    expect(Object.keys(info).length).toBeGreaterThanOrEqual(10);
  });
});

describe("computeMilestones", () => {
  const targets: Macros = { calories: 2000, protein: 150, carbs: 200, fat: 65 };

  it("awards first_meal when user has 1+ meal", () => {
    const meals = [makeMeal("2025-02-10")];
    const { newMilestones, xpGained } = computeMilestones(
      meals,
      null,
      targets,
      0,
      false,
      new Set()
    );
    expect(newMilestones).toContainEqual(
      expect.objectContaining({ id: "first_meal" })
    );
    expect(xpGained).toBe(25);
  });

  it("does not award first_meal if already earned", () => {
    const meals = [makeMeal("2025-02-10")];
    const { newMilestones, xpGained } = computeMilestones(
      meals,
      null,
      targets,
      0,
      false,
      new Set(["first_meal"])
    );
    expect(newMilestones).toHaveLength(0);
    expect(xpGained).toBe(0);
  });

  it("awards plan_adjuster when hasAdjustedPlan is true", () => {
    const meals: MealEntry[] = [];
    const { newMilestones } = computeMilestones(
      meals,
      null,
      targets,
      0,
      true,
      new Set()
    );
    expect(newMilestones).toContainEqual(
      expect.objectContaining({ id: "plan_adjuster" })
    );
  });

  it("returns progress for streak thresholds", () => {
    const today = new Date().toISOString().slice(0, 10);
    const meals = [
      makeMeal(today),
      makeMeal(new Date(Date.now() - 86400000).toISOString().slice(0, 10)),
    ];
    const { progress } = computeMilestones(
      meals,
      null,
      targets,
      0,
      false,
      new Set()
    );
    expect(progress.streak_3).toBeDefined();
    expect(progress.streak_3).toBeLessThanOrEqual(100);
  });
});
