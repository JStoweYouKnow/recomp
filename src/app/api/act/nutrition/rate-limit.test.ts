import { beforeEach, describe, expect, it } from "vitest";
import { __resetRateLimitBuckets } from "@/lib/server-rate-limit";

describe("act/nutrition rate limit", () => {
  beforeEach(() => {
    __resetRateLimitBuckets();
  });

  it("returns 429 once limit is exceeded", async () => {
    const { POST } = await import("./route");
    let lastStatus = 0;
    for (let i = 0; i < 13; i++) {
      const req = new Request("http://localhost/api/act/nutrition", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "14.14.14.14",
        },
        body: JSON.stringify({}),
      });
      const res = await POST(req as unknown as import("next/server").NextRequest);
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
