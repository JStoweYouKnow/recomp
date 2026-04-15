import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  getUserId: vi.fn(),
  getSecureCookieOptions: vi.fn((maxAge: number) => ({
    httpOnly: true,
    secure: false,
    sameSite: "lax" as const,
    maxAge,
    path: "/",
  })),
}));

describe("POST /api/wearables/oura/connect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 401 when unauthenticated", async () => {
    const { getUserId } = await import("@/lib/auth");
    vi.mocked(getUserId).mockResolvedValue(null);
    const { POST } = await import("./route");
    const req = new Request("http://localhost/api/wearables/oura/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "x" }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(401);
  });

  it("sets token and token-user binding cookies when authenticated", async () => {
    const { getUserId } = await import("@/lib/auth");
    vi.mocked(getUserId).mockResolvedValue("user-a");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    );
    const { POST } = await import("./route");
    const req = new Request("http://localhost/api/wearables/oura/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "oura-token-value-that-is-definitely-long-enough" }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("oura_token=");
    expect(setCookie).toContain("oura_token_uid=user-a");
  });
});
