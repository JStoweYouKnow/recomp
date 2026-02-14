import { beforeEach, describe, expect, it } from "vitest";
import { __resetRateLimitBuckets } from "@/lib/server-rate-limit";

describe("voice/sonic/stream rate limit", () => {
  beforeEach(() => {
    __resetRateLimitBuckets();
  });

  it("returns 429 once limit is exceeded", async () => {
    const { POST } = await import("./route");
    let lastStatus = 0;
    let lastRes: Response | null = null;
    for (let i = 0; i < 31; i++) {
      const req = new Request("http://localhost/api/voice/sonic/stream", {
        method: "POST",
        headers: { "x-forwarded-for": "10.10.10.10" },
        body: null,
      });
      const res = await POST(req as unknown as import("next/server").NextRequest);
      lastStatus = res.status;
      lastRes = res;
    }
    expect(lastStatus).toBe(429);
    expect(lastRes?.headers.get("retry-after")).toBeTruthy();
    expect(lastRes?.headers.get("x-ratelimit-limit")).toBeTruthy();
  });
});
