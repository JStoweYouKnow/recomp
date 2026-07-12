import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  dbSaveProfile: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getUserId: vi.fn(),
  buildSetCookieHeader: vi.fn(() => "recomp_uid=test-user; Path=/; HttpOnly"),
}));

vi.mock("uuid", () => ({
  v4: vi.fn(() => "generated-user"),
}));

vi.mock("@/lib/server-rate-limit", () => ({
  fixedWindowRateLimit: vi.fn().mockResolvedValue({ ok: true }),
  getClientKey: (_ip: string, _suffix: string) => "test-register-rl",
  getRequestIp: () => "127.0.0.1",
}));

describe("POST /api/auth/register", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { dbSaveProfile } = await import("@/lib/db");
    vi.mocked(dbSaveProfile).mockResolvedValue(undefined);
  });

  it("returns 400 for invalid payload", async () => {
    const { POST } = await import("./route");
    const req = new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(400);
  });

  it("uses existing authenticated user id instead of client-provided id", async () => {
    const { getUserId } = await import("@/lib/auth");
    vi.mocked(getUserId).mockResolvedValue("cookie-user");

    const { dbSaveProfile } = await import("@/lib/db");
    const { POST } = await import("./route");

    const req = new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "attacker-id", name: "Alex" }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.userId).toBe("cookie-user");
    expect(vi.mocked(dbSaveProfile)).toHaveBeenCalledWith(
      "cookie-user",
      expect.objectContaining({ id: "cookie-user", name: "Alex" })
    );
  });

  it("still returns 200 and sets cookie when db persistence fails", async () => {
    const { getUserId } = await import("@/lib/auth");
    vi.mocked(getUserId).mockResolvedValue("cookie-user");
    const { dbSaveProfile } = await import("@/lib/db");
    vi.mocked(dbSaveProfile).mockRejectedValue(new Error("dynamo down"));

    const { POST } = await import("./route");
    const req = new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Alex" }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.profileSaved).toBe(false);
    expect(res.headers.get("set-cookie")).toContain("recomp_uid=");
  });

  it("returns 400 when name exceeds 80 characters", async () => {
    const { POST } = await import("./route");
    const req = new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "a".repeat(81) }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(400);
  });

  it("returns 400 when body is not valid JSON", async () => {
    const { POST } = await import("./route");
    const req = new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json {",
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(400);
  });

  it("accepts empty email and password strings after normalization", async () => {
    const { getUserId } = await import("@/lib/auth");
    vi.mocked(getUserId).mockResolvedValue(null);
    const { POST } = await import("./route");
    const req = new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Pat", email: "", password: "" }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(200);
  });
});
