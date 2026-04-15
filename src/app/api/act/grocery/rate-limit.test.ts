import { beforeEach, describe, expect, it } from "vitest";
import { __resetRateLimitBuckets } from "@/lib/server-rate-limit";

describe("act/grocery rate limit", () => {
  beforeEach(() => {
    __resetRateLimitBuckets();
  });

  it("returns 429 once limit is exceeded", async () => {
    const { POST } = await import("./route");
    let lastStatus = 0;
    for (let i = 0; i < 9; i++) {
      const req = new Request("http://localhost/api/act/grocery", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "13.13.13.13",
        },
        body: JSON.stringify({}),
      });
      const res = await POST(req as unknown as import("next/server").NextRequest);
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
