import { describe, it, expect, vi } from "vitest";
import { POST } from "./route";
import type { FitnessPlan } from "@/lib/types";

vi.mock("@/lib/nova", () => ({
  invokeNova: vi.fn().mockResolvedValue(
    JSON.stringify({
      recommendedAction: "catch_up",
      summary: "Add missed sessions to your queue.",
      weeksMissed: 1,
    })
  ),
}));

vi.mock("@/lib/server-rate-limit", () => ({
  fixedWindowRateLimit: vi.fn().mockResolvedValue({ ok: true }),
  getClientKey: vi.fn().mockReturnValue("test"),
  getRequestIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/logger", () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
  withRequestLogging: (_path: string, handler: typeof POST) => handler,
}));

function makePlan(): FitnessPlan {
  return {
    id: "p1",
    userId: "u1",
    createdAt: "2026-01-01",
    dietPlan: { dailyTargets: { calories: 2000, protein: 150, carbs: 200, fat: 65 }, weeklyPlan: [], tips: [] },
    workoutPlan: {
      weeklyPlan: [
        { day: "Monday", focus: "Push", exercises: [{ name: "Bench", sets: "3", reps: "10" }] },
        { day: "Wednesday", focus: "Pull", exercises: [{ name: "Row", sets: "3", reps: "10" }] },
      ],
      tips: [],
    },
  };
}

describe("POST /api/plans/adjust-schedule", () => {
  it("applies catch_up action", async () => {
    const req = new Request("http://localhost/api/plans/adjust-schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: makePlan(), action: "catch_up", today: "2026-06-30" }),
    });

    const res = await POST(req as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.action).toBe("catch_up");
    expect(Array.isArray(json.workoutPlan.missedSessions)).toBe(true);
  });
});
