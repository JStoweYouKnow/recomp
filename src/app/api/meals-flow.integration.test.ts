/**
 * Integration test: Meals suggest flow
 * Verifies AI meal suggestions return valid structure.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/server-rate-limit", () => ({
  fixedWindowRateLimit: () => ({ ok: true }),
  getClientKey: () => "test-key",
  getRequestIp: () => "127.0.0.1",
}));
vi.mock("@/lib/nova", () => ({ invokeNova: vi.fn() }));

describe("Meals suggest flow integration", () => {
  beforeEach(async () => {
    const { invokeNova } = await import("@/lib/nova");
    vi.mocked(invokeNova).mockResolvedValue(JSON.stringify({
      suggestions: [
        { name: "Grilled chicken salad", description: "High protein", calories: 450, protein: 42, carbs: 12, fat: 28 },
        { name: "Greek yogurt bowl", description: "Quick snack", calories: 220, protein: 18, carbs: 24, fat: 6 },
      ],
    }));
  });

  it("returns meal suggestions for given constraints", async () => {
    const { POST } = await import("@/app/api/meals/suggest/route");
    const req = new Request("http://localhost/api/meals/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mealType: "lunch",
        remainingCalories: 600,
        remainingProtein: 40,
      }),
    });
    const res = await POST(req as import("next/server").NextRequest);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.suggestions).toBeDefined();
    expect(Array.isArray(data.suggestions)).toBe(true);
    expect(data.suggestions.length).toBeGreaterThan(0);
    expect(data.suggestions[0]).toHaveProperty("name");
    expect(data.suggestions[0]).toHaveProperty("calories");
    expect(data.suggestions[0]).toHaveProperty("protein");
  });
});
