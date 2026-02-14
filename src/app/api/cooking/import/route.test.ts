import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  getUserId: vi.fn().mockResolvedValue("user-123"),
  getSecureCookieOptions: vi.fn().mockReturnValue({}),
}));

vi.mock("@/lib/nova", () => ({
  invokeNova: vi.fn().mockResolvedValue(
    JSON.stringify([
      {
        name: "Chicken Stir Fry",
        mealType: "dinner",
        date: "2026-02-10",
        macros: { calories: 520, protein: 38, carbs: 45, fat: 14 },
        notes: "High protein dinner",
      },
      {
        name: "Morning Smoothie",
        mealType: "breakfast",
        date: "2026-02-10",
        macros: { calories: 280, protein: 15, carbs: 40, fat: 8 },
      },
    ])
  ),
}));

vi.mock("@/lib/server-rate-limit", () => ({
  fixedWindowRateLimit: vi.fn().mockReturnValue({ ok: true, remaining: 9, limit: 10, resetAt: Date.now() + 60_000 }),
  getClientKey: vi.fn().mockReturnValue("cooking-import:127.0.0.1"),
  getRateLimitHeaderValues: vi.fn().mockReturnValue({ limit: "10", remaining: "9", reset: "60", retryAfter: "60" }),
  getRequestIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

import { POST } from "./route";

describe("POST /api/cooking/import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses text data via Nova AI and returns meal entries", async () => {
    const req = new NextRequest("http://localhost/api/cooking/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: "Chicken Stir Fry - 520 cal, 38g protein, 45g carbs, 14g fat\nMorning Smoothie - 280 cal, 15g protein",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.imported).toBe(2);
    expect(data.meals[0].name).toBe("Chicken Stir Fry");
    expect(data.meals[0].macros.calories).toBe(520);
    expect(data.meals[1].name).toBe("Morning Smoothie");
  });

  it("requires authentication", async () => {
    const { getUserId } = await import("@/lib/auth");
    (getUserId as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const req = new NextRequest("http://localhost/api/cooking/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: "some food data" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("rejects empty data", async () => {
    const req = new NextRequest("http://localhost/api/cooking/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: "" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects missing data field", async () => {
    const req = new NextRequest("http://localhost/api/cooking/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wrongField: "data" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rate limits requests", async () => {
    const { fixedWindowRateLimit } = await import("@/lib/server-rate-limit");
    (fixedWindowRateLimit as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      ok: false,
      remaining: 0,
      limit: 10,
      resetAt: Date.now() + 60_000,
    });

    const req = new NextRequest("http://localhost/api/cooking/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: "some food" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(429);
  });

  it("handles Nova returning non-parseable response", async () => {
    const { invokeNova } = await import("@/lib/nova");
    (invokeNova as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      "I cannot parse this data into structured meals."
    );

    const req = new NextRequest("http://localhost/api/cooking/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: "random gibberish that is not food data" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(422);
  });
});
