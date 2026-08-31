import { describe, it, expect } from "vitest";
import {
  getRequiredEquipment,
  isExerciseCompatible,
  normalizeExerciseKey,
  resolveAvailableEquipment,
} from "./exercise-equipment";

describe("exercise-equipment", () => {
  it("normalizes exercise names for lookup", () => {
    expect(normalizeExerciseKey("Lat Pulldown (Cable)")).toBe("lat pulldown");
  });

  it("flags cable exercises incompatible with home bodyweight setup", () => {
    const available = resolveAvailableEquipment("home", ["bodyweight", "resistance_bands"]);
    expect(isExerciseCompatible("Lat Pulldown", available)).toBe(false);
    expect(getRequiredEquipment("Lat Pulldown")).toContain("cable_machine");
  });

  it("allows push-ups with bodyweight equipment", () => {
    const available = resolveAvailableEquipment("home", ["bodyweight"]);
    expect(isExerciseCompatible("Push-Up", available)).toBe(true);
  });

  it("defaults gym location to full equipment", () => {
    const available = resolveAvailableEquipment("gym", undefined);
    expect(isExerciseCompatible("Leg Press", available)).toBe(true);
  });
});
