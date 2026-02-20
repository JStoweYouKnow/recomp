import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as storage from "./storage";

describe("storage", () => {
  const mockLocalStorage: Record<string, string> = {};

  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => mockLocalStorage[key] ?? null,
      setItem: (key: string, value: string) => { mockLocalStorage[key] = value; },
      removeItem: (key: string) => { delete mockLocalStorage[key]; },
      clear: () => { Object.keys(mockLocalStorage).forEach((k) => delete mockLocalStorage[k]); },
      length: 0,
      key: () => null,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("getRicoHistory returns empty array when no data", () => {
    expect(storage.getRicoHistory()).toEqual([]);
  });

  it("saveRicoHistory and getRicoHistory roundtrip", () => {
    const messages = [
      { role: "user" as const, content: "hi", at: "2025-01-01T00:00:00.000Z" },
      { role: "assistant" as const, content: "hello", at: "2025-01-01T00:00:01.000Z" },
    ];
    storage.saveRicoHistory(messages);
    expect(storage.getRicoHistory()).toEqual(messages);
  });

  it("getXP returns 0 when not set", () => {
    expect(storage.getXP()).toBe(0);
  });

  it("saveXP and getXP roundtrip", () => {
    storage.saveXP(150);
    expect(storage.getXP()).toBe(150);
  });

  it("saveXP clamps negative to 0", () => {
    storage.saveXP(-10);
    expect(storage.getXP()).toBe(0);
  });

  it("getXP returns 0 when value is invalid JSON (non-numeric)", () => {
    mockLocalStorage["recomp_xp"] = "abc";
    expect(storage.getXP()).toBe(0);
  });

  it("getXP returns 0 when value is negative string", () => {
    mockLocalStorage["recomp_xp"] = "-99";
    expect(storage.getXP()).toBe(0);
  });

  it("getProfile returns null when stored value is invalid JSON", () => {
    mockLocalStorage["recomp_profile"] = "not json {";
    expect(storage.getProfile()).toBeNull();
  });

  it("getMeals returns empty array when stored value is invalid JSON", () => {
    mockLocalStorage["recomp_meals"] = "not an array";
    expect(storage.getMeals()).toEqual([]);
  });

  it("getMeals returns empty array when stored value is not an array", () => {
    mockLocalStorage["recomp_meals"] = '{"foo":1}';
    expect(storage.getMeals()).toEqual([]);
  });

  it("getPlan returns null when stored value is invalid JSON", () => {
    mockLocalStorage["recomp_plan"] = "invalid";
    expect(storage.getPlan()).toBeNull();
  });

  it("saveRicoHistory caps at 50 messages (stress: 100 messages)", () => {
    const many = Array.from({ length: 100 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as const,
      content: `msg ${i}`,
      at: new Date().toISOString(),
    }));
    storage.saveRicoHistory(many);
    const loaded = storage.getRicoHistory();
    expect(loaded).toHaveLength(50);
    expect(loaded[0].content).toBe("msg 50");
    expect(loaded[49].content).toBe("msg 99");
  });

  it("getMeals handles large array without throwing (stress: 2000 items)", () => {
    const large = Array.from({ length: 2000 }, (_, i) => ({
      id: `m-${i}`,
      date: "2025-02-10",
      mealType: "lunch" as const,
      name: "Meal",
      macros: { calories: 500, protein: 20, carbs: 50, fat: 20 },
      loggedAt: new Date().toISOString(),
    }));
    storage.saveMeals(large);
    const loaded = storage.getMeals();
    expect(loaded).toHaveLength(2000);
  });
});
