import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetRateLimitBuckets } from "@/lib/server-rate-limit";

vi.mock("@/lib/nova", () => ({
  invokeNovaCanvas: vi.fn().mockResolvedValue("base64-image"),
}));

describe("images/generate rate limit", () => {
  beforeEach(() => {
    __resetRateLimitBuckets();
  });

  it("returns 429 once limit is exceeded", async () => {
    const { POST } = await import("./route");
    let lastStatus = 0;
    for (let i = 0; i < 21; i++) {
      const req = new Request("http://localhost/api/images/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "11.11.11.11",
        },
        body: JSON.stringify({ prompt: "healthy meal", type: "meal" }),
      });
      const res = await POST(req as unknown as import("next/server").NextRequest);
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
