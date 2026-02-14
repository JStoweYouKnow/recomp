/**
 * Integration test: onboarding → plan generation flow
 * Calls route handlers with mocked auth and Nova. Verifies the critical user journey.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ getUserId: vi.fn() }));
vi.mock("@/lib/server-rate-limit", () => ({
  fixedWindowRateLimit: () => ({ ok: true }),
  getClientKey: () => "test-key",
  getRateLimitHeaderValues: () => ({ limit: "20", remaining: "19", reset: "0", retryAfter: "0" }),
  getRequestIp: () => "127.0.0.1",
}));
vi.mock("@/lib/nova", () => ({ invokeNovaWithExtendedThinking: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

const mockProfile = {
  name: "Test User",
  age: 30,
  weight: 70,
  height: 170,
  gender: "other",
  fitnessLevel: "intermediate",
  goal: "maintain",
  dailyActivityLevel: "moderate",
  workoutLocation: "gym",
  workoutEquipment: ["free_weights", "machines"],
  workoutDaysPerWeek: 4,
  workoutTimeframe: "flexible",
  dietaryRestrictions: [],
};

describe("Onboarding flow integration", () => {
  beforeEach(async () => {
    const { getUserId } = await import("@/lib/auth");
    vi.mocked(getUserId).mockResolvedValue("test-user-id");
    const { invokeNovaWithExtendedThinking } = await import("@/lib/nova");
    vi.mocked(invokeNovaWithExtendedThinking).mockResolvedValue(JSON.stringify({
      dailyTargets: { calories: 2000, protein: 150, carbs: 200, fat: 65 },
      dietDays: [{ day: "Monday", meals: [{ mealType: "Breakfast", description: "Oatmeal", calories: 400, protein: 15, carbs: 60, fat: 8 }] }],
      workoutDays: [{ day: "Monday", focus: "Upper body", exercises: [{ name: "Bench press", sets: "3", reps: "8-10" }] }],
      dietTips: ["Stay hydrated"],
      workoutTips: ["Warm up"],
    }));
  });

  it("plan generation accepts profile and returns valid plan structure", async () => {
    const { POST } = await import("@/app/api/plans/generate/route");
    const req = new Request("http://localhost/api/plans/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mockProfile),
    });
    const res = await POST(req as import("next/server").NextRequest);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.dietPlan).toBeDefined();
    expect(data.dietPlan.dailyTargets).toEqual({ calories: 2000, protein: 150, carbs: 200, fat: 65 });
    expect(data.workoutPlan).toBeDefined();
    expect(data.workoutPlan.weeklyPlan).toHaveLength(1);
    expect(data.workoutPlan.weeklyPlan[0].day).toBe("Monday");
    expect(data.workoutPlan.weeklyPlan[0].exercises).toHaveLength(1);
  });

  it("plan generation rejects invalid profile", async () => {
    const { POST } = await import("@/app/api/plans/generate/route");
    const req = new Request("http://localhost/api/plans/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Only name" }),
    });
    const res = await POST(req as import("next/server").NextRequest);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBeDefined();
  });
});
