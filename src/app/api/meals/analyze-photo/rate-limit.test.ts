import { beforeEach, describe, expect, it } from "vitest";
import { __resetRateLimitBuckets } from "@/lib/server-rate-limit";

describe("meals/analyze-photo rate limit", () => {
  beforeEach(() => {
    __resetRateLimitBuckets();
  });

  it("returns 429 once limit is exceeded", async () => {
    const { POST } = await import("./route");
    let lastStatus = 0;
    for (let i = 0; i < 21; i++) {
      const fd = new FormData();
      const req = new Request("http://localhost/api/meals/analyze-photo", {
        method: "POST",
        headers: { "x-forwarded-for": "15.15.15.15" },
        body: fd,
      });
      const res = await POST(req as unknown as import("next/server").NextRequest);
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
