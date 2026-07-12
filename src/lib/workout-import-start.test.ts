import { describe, it, expect } from "vitest";
import {
  inferFirstSessionDate,
  inferProgramWeek1Start,
  isAnchoredWorkoutProgram,
  nextOccurrenceOfWeekday,
  weekdayIndexFromDayLabel,
} from "./workout-import-start";

describe("weekdayIndexFromDayLabel", () => {
  it("parses weekday prefixes", () => {
    expect(weekdayIndexFromDayLabel("Monday — Week 1")).toBe(1);
    expect(weekdayIndexFromDayLabel("Wednesday: Push")).toBe(3);
  });
});

describe("nextOccurrenceOfWeekday", () => {
  it("returns next Monday when today is Saturday", () => {
    expect(nextOccurrenceOfWeekday(1, "2026-07-11")).toBe("2026-07-13");
  });

  it("returns next Monday when this week's Monday has passed", () => {
    expect(nextOccurrenceOfWeekday(1, "2026-07-07")).toBe("2026-07-13");
  });

  it("returns today when weekday matches", () => {
    expect(nextOccurrenceOfWeekday(1, "2026-07-13")).toBe("2026-07-13");
    expect(nextOccurrenceOfWeekday(6, "2026-07-11")).toBe("2026-07-11");
  });
});

describe("inferProgramWeek1Start", () => {
  it("anchors Saturday upload to the following Monday week", () => {
    const plan = [
      { day: "Monday — Week 1", focus: "A", exercises: [] },
      { day: "Wednesday — Week 1", focus: "B", exercises: [] },
      { day: "Friday — Week 1", focus: "C", exercises: [] },
      { day: "Monday — Week 2", focus: "A", exercises: [] },
    ];
    expect(inferFirstSessionDate(plan, "2026-07-11")).toBe("2026-07-13");
    expect(inferProgramWeek1Start(plan, "2026-07-11")).toBe("2026-07-13");
  });

  it("skips anchor for classic repeating weekly plans", () => {
    const plan = [
      { day: "Monday", focus: "Push", exercises: [] },
      { day: "Wednesday", focus: "Pull", exercises: [] },
    ];
    expect(isAnchoredWorkoutProgram(plan)).toBe(false);
    expect(inferProgramWeek1Start(plan, "2026-06-11")).toBeUndefined();
  });
});
