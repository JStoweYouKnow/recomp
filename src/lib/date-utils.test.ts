import { describe, it, expect } from "vitest";
import {
  coerceTimezoneOffsetMinutes,
  getTodayFromTimezoneOffset,
  parseClientDateString,
  resolveMealLogDate,
} from "./date-utils";

describe("parseClientDateString", () => {
  it("accepts YYYY-MM-DD", () => {
    expect(parseClientDateString("2026-08-07")).toBe("2026-08-07");
  });

  it("rejects invalid strings", () => {
    expect(parseClientDateString("08/07/2026")).toBeUndefined();
    expect(parseClientDateString(123)).toBeUndefined();
  });
});

describe("getTodayFromTimezoneOffset", () => {
  it("matches local calendar day from offset", () => {
    const offset = new Date().getTimezoneOffset();
    const expected = (() => {
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    })();
    expect(getTodayFromTimezoneOffset(offset)).toBe(expected);
  });
});

describe("coerceTimezoneOffsetMinutes", () => {
  it("accepts numbers and numeric strings", () => {
    expect(coerceTimezoneOffsetMinutes(480)).toBe(480);
    expect(coerceTimezoneOffsetMinutes("480")).toBe(480);
  });

  it("rejects invalid values", () => {
    expect(coerceTimezoneOffsetMinutes("pst")).toBeUndefined();
    expect(coerceTimezoneOffsetMinutes(null)).toBeUndefined();
  });
});

describe("resolveMealLogDate", () => {
  it("prefers explicit clientDate", () => {
    expect(
      resolveMealLogDate({
        clientDate: "2026-08-05",
        timezoneOffsetMinutes: 480,
      }),
    ).toBe("2026-08-05");
  });

  it("uses timezone offset when clientDate missing", () => {
    const offset = new Date().getTimezoneOffset();
    expect(resolveMealLogDate({ timezoneOffsetMinutes: offset })).toBe(
      getTodayFromTimezoneOffset(offset),
    );
    expect(resolveMealLogDate({ timezoneOffsetMinutes: String(offset) })).toBe(
      getTodayFromTimezoneOffset(offset),
    );
  });
});
