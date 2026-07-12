/**
 * Ensures a GET-shaped sync snapshot can be flattened into a POST body that passes `syncBodySchema`
 * (matches Android `buildSyncPushPayload` / iOS echo semantics).
 */
import { describe, it, expect } from "vitest";
import { syncBodySchema } from "@/lib/sync-schema";

const POST_COPY_KEYS = new Set([
  "profile",
  "plan",
  "meals",
  "milestones",
  "wearableConnections",
  "wearableData",
  "hydration",
  "fastingSessions",
  "biofeedback",
  "pantry",
  "savedRecipes",
  "bodyScans",
  "supplements",
  "bloodWork",
  "activityLog",
  "workoutProgress",
  "metabolicModel",
  "recentExerciseNames",
]);

const META_TOP_KEYS = ["xp", "hasAdjusted", "ricoHistory", "measurementTargets"] as const;

function androidStyleFlatten(getSnapshot: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of POST_COPY_KEYS) {
    if (key in getSnapshot && getSnapshot[key] !== undefined) {
      out[key] = getSnapshot[key];
    }
  }
  const meta = getSnapshot.meta;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const m = meta as Record<string, unknown>;
    for (const mk of META_TOP_KEYS) {
      if (mk in m && m[mk] !== undefined) {
        out[mk] = m[mk];
      }
    }
  }
  return out;
}

describe("sync POST body shape (GET echo)", () => {
  it("accepts flattened snapshot produced from a typical GET payload", () => {
    const getSnapshot = {
      profile: {
        id: "u1",
        name: "Test",
        age: 30,
        weight: 180,
        height: 175,
        gender: "male",
        fitnessLevel: "intermediate",
        goal: "maintain",
        dietaryRestrictions: [],
        injuriesOrLimitations: [],
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      meta: {
        xp: 42,
        hasAdjusted: false,
        ricoHistory: [],
        measurementTargets: null,
      },
      plan: null,
      meals: [],
      milestones: [],
      workoutProgress: {},
      weeklyReview: undefined,
    };

    const body = androidStyleFlatten(getSnapshot as Record<string, unknown>);
    const parsed = syncBodySchema.safeParse(body);
    expect(parsed.success).toBe(true);
  });
});
