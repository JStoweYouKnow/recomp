import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  parseAllWorkoutTablesFromHtml,
  parseWorkoutTableInner,
} from "./workout-import-html";

describe("workout-import-html", () => {
  it("parses multiple workoutTable blocks", () => {
    const fixture = path.join(
      process.cwd(),
      "src/lib/__fixtures__/muscleandstrength-workout-table-snippet.html"
    );
    const html = fs.readFileSync(fixture, "utf8");
    const days = parseAllWorkoutTablesFromHtml(html);
    expect(days).toHaveLength(2);
    expect(days[0].day).toMatch(/Workout A/i);
    expect(days[0].exercises.length).toBeGreaterThanOrEqual(1);
    expect(days[1].day).toMatch(/Workout B/i);
  });

  it("returns null for empty table inner", () => {
    expect(parseWorkoutTableInner("<tr><th>Sets</th><th>Reps</th></tr>")).toBeNull();
  });
});
