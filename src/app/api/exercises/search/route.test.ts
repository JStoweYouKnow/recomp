import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

describe("GET /api/exercises/search", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 400 when name is missing", async () => {
    const req = new NextRequest("http://localhost/api/exercises/search", { method: "GET" });
    const { GET } = await import("./route");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/missing|name/i);
  });

  it("returns 400 when name is empty after trim", async () => {
    const req = new NextRequest("http://localhost/api/exercises/search?name=%20%20", { method: "GET" });
    const { GET } = await import("./route");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when name exceeds 300 characters", async () => {
    const longName = "a".repeat(301);
    const req = new NextRequest(`http://localhost/api/exercises/search?name=${encodeURIComponent(longName)}`, { method: "GET" });
    const { GET } = await import("./route");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/too long|300/i);
  });
});
