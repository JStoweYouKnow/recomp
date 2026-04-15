import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import crypto from "crypto";

vi.mock("@/lib/auth", () => ({
  getUserId: vi.fn().mockResolvedValue("user-123"),
  getSecureCookieOptions: vi.fn().mockReturnValue({}),
}));

vi.mock("@/lib/server-rate-limit", () => ({
  fixedWindowRateLimit: vi.fn().mockReturnValue({ ok: true, remaining: 29, limit: 30, resetAt: Date.now() + 60_000 }),
  getClientKey: vi.fn().mockReturnValue("cooking-webhook:127.0.0.1"),
  getRateLimitHeaderValues: vi.fn().mockReturnValue({ limit: "30", remaining: "29", reset: "60", retryAfter: "60" }),
  getRequestIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

import { POST } from "./route";

function makeReq(body: unknown, headers?: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/cooking/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/cooking/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts valid meal payload and returns transformed entries", async () => {
    const body = {
      meals: [
        {
          provider: "cronometer",
          name: "Grilled Chicken Salad",
          mealType: "lunch",
          macros: { calories: 450, protein: 42, carbs: 20, fat: 12 },
        },
      ],
    };
    const res = await POST(makeReq(body));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.accepted).toBe(1);
    expect(data.meals[0].name).toBe("Grilled Chicken Salad");
    expect(data.meals[0].macros.calories).toBe(450);
    expect(data.meals[0].macros.protein).toBe(42);
  });

  it("applies servings multiplier", async () => {
    const body = {
      meals: [
        {
          provider: "yummly",
          name: "Pasta",
          servings: 2,
          macros: { calories: 300, protein: 10, carbs: 50, fat: 8 },
        },
      ],
    };
    const res = await POST(makeReq(body));
    const data = await res.json();
    expect(data.meals[0].macros.calories).toBe(600);
    expect(data.meals[0].macros.protein).toBe(20);
  });

  it("rejects empty meals array", async () => {
    const res = await POST(makeReq({ meals: [] }));
    expect(res.status).toBe(400);
  });

  it("rejects invalid provider", async () => {
    const body = {
      meals: [
        { provider: "unknown_app", name: "Food", macros: { calories: 100 } },
      ],
    };
    const res = await POST(makeReq(body));
    expect(res.status).toBe(400);
  });

  it("includes provider in notes", async () => {
    const body = {
      meals: [
        {
          provider: "myfitnesspal",
          name: "Oatmeal",
          macros: { calories: 200, protein: 6, carbs: 35, fat: 4, fiber: 5 },
        },
      ],
    };
    const res = await POST(makeReq(body));
    const data = await res.json();
    expect(data.meals[0].notes).toContain("via myfitnesspal");
    expect(data.meals[0].notes).toContain("Fiber: 5g");
  });

  it("rate limits requests", async () => {
    const { fixedWindowRateLimit } = await import("@/lib/server-rate-limit");
    (fixedWindowRateLimit as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      ok: false,
      remaining: 0,
      limit: 30,
      resetAt: Date.now() + 60_000,
    });
    const body = {
      meals: [{ provider: "cronometer", name: "Food", macros: { calories: 100 } }],
    };
    const res = await POST(makeReq(body));
    expect(res.status).toBe(429);
  });

  it("verifies HMAC signature for unauthenticated requests", async () => {
    const { getUserId } = await import("@/lib/auth");
    (getUserId as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const secret = "test-webhook-secret";
    process.env.COOKING_WEBHOOK_SECRET = secret;

    const body = {
      meals: [{ provider: "cronometer", name: "Food", macros: { calories: 100 } }],
    };
    const bodyStr = JSON.stringify(body);
    const sig = crypto.createHmac("sha256", secret).update(bodyStr).digest("hex");

    const res = await POST(makeReq(body, { "x-webhook-signature": sig }));
    expect(res.status).toBe(200);

    delete process.env.COOKING_WEBHOOK_SECRET;
  });

  it("rejects invalid HMAC signature", async () => {
    const { getUserId } = await import("@/lib/auth");
    (getUserId as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    process.env.COOKING_WEBHOOK_SECRET = "real-secret";

    const body = {
      meals: [{ provider: "cronometer", name: "Food", macros: { calories: 100 } }],
    };

    const res = await POST(makeReq(body, { "x-webhook-signature": "bad-sig" }));
    expect(res.status).toBe(403);

    delete process.env.COOKING_WEBHOOK_SECRET;
  });
});
