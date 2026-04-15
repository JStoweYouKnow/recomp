import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

describe("POST /api/wearables/health/import", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 500 when body is not valid JSON (stress)", async () => {
    const req = new NextRequest("http://localhost/api/wearables/health/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "invalid json {",
    });
    const { POST } = await import("./route");
    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toMatch(/import failed|failed/i);
  });

  it("accepts large array without throwing (stress: 1000 rows)", async () => {
    const large = Array.from({ length: 1000 }, (_, i) => ({
      date: new Date(Date.now() - i * 86400000).toISOString().slice(0, 10),
      steps: 5000 + i,
      provider: "apple",
    }));
    const req = new NextRequest("http://localhost/api/wearables/health/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(large),
    });
    const { POST } = await import("./route");
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.count).toBeGreaterThan(0);
  });
});
