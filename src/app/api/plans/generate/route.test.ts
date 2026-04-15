import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  getUserId: vi.fn(),
}));

vi.mock("@/lib/nova", () => ({
  invokeNovaWithExtendedThinking: vi.fn(),
}));

describe("POST /api/plans/generate", () => {
  it("returns 401 when unauthenticated", async () => {
    const { getUserId } = await import("@/lib/auth");
    vi.mocked(getUserId).mockResolvedValue(null);

    const { POST } = await import("./route");
    const req = new Request("http://localhost/api/plans/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Alex", fitnessLevel: "beginner", goal: "maintain" }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(401);
  });
});
