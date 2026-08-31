import { describe, it, expect } from "vitest";
import {
  getLearnedReplacement,
  recordSubstitution,
  recordSubstitutionsBatch,
} from "./exercise-substitutions";

describe("exercise-substitutions", () => {
  it("records and retrieves a learned substitution", () => {
    const prefs = recordSubstitution([], {
      original: "Lat Pulldown",
      replacement: "Band Pulldown",
      reason: "No cable",
      source: "import",
    });
    const hit = getLearnedReplacement("Lat Pulldown", prefs);
    expect(hit?.replacement).toBe("Band Pulldown");
    expect(hit?.useCount).toBe(1);
  });

  it("increments use count when teaching the same original again", () => {
    const first = recordSubstitution([], {
      original: "Leg Press",
      replacement: "Goblet Squat",
    });
    const second = recordSubstitution(first, {
      original: "Leg Press",
      replacement: "Bulgarian Split Squat",
    });
    expect(second).toHaveLength(1);
    expect(second[0].replacement).toBe("Bulgarian Split Squat");
    expect(second[0].useCount).toBe(2);
  });

  it("batch-teaches multiple swaps", () => {
    const prefs = recordSubstitutionsBatch([], [
      { original: "A", replacement: "A1" },
      { original: "B", replacement: "B1" },
    ]);
    expect(prefs).toHaveLength(2);
  });
});
