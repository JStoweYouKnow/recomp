import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  getUserId: vi.fn(),
}));

describe("GET /api/wearables/oura/data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects token/user mismatch", async () => {
    const { getUserId } = await import("@/lib/auth");
    vi.mocked(getUserId).mockResolvedValue("user-a");
    const { GET } = await import("./route");

    const req = new NextRequest("http://localhost/api/wearables/oura/data", {
      headers: { cookie: "oura_token=abc; oura_token_uid=user-b" },
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});
