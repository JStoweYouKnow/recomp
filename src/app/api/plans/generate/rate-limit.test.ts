import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetRateLimitBuckets } from "@/lib/server-rate-limit";

vi.mock("@/lib/auth", () => ({
  getUserId: vi.fn(),
}));

vi.mock("@/lib/nova", () => ({
  invokeNovaWithExtendedThinking: vi.fn().mockResolvedValue(
    JSON.stringify({
      dailyTargets: { calories: 2000, protein: 150, carbs: 200, fat: 65 },
      dietDays: [],
      workoutDays: [],
      dietTips: [],
      workoutTips: [],
    })
  ),
}));

describe("plans/generate rate limit", () => {
  beforeEach(() => {
    __resetRateLimitBuckets();
    vi.clearAllMocks();
  });

  it("returns 429 once limit is exceeded", async () => {
    const { getUserId } = await import("@/lib/auth");
    vi.mocked(getUserId).mockResolvedValue("user-1");
    const { POST } = await import("./route");

    let lastStatus = 0;
    let lastRes: Response | null = null;
    for (let i = 0; i < 21; i++) {
      const req = new Request("http://localhost/api/plans/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "9.9.9.9",
        },
        body: JSON.stringify({ name: "Alex", fitnessLevel: "beginner", goal: "maintain" }),
      });
      const res = await POST(req as unknown as import("next/server").NextRequest);
      lastStatus = res.status;
      lastRes = res;
    }
    expect(lastStatus).toBe(429);
    expect(lastRes?.headers.get("retry-after")).toBeTruthy();
    expect(lastRes?.headers.get("x-ratelimit-limit")).toBeTruthy();
  });
});
