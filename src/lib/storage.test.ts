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
});
