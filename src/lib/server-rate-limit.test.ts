import { describe, it, expect } from "vitest";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "./server-rate-limit";

describe("server-rate-limit", () => {
  it("allows within fixed window then blocks", () => {
    const key = getClientKey("127.0.0.1", "test-route");
    const now = 1_000;
    const a = fixedWindowRateLimit(key, 2, 1_000, now);
    const b = fixedWindowRateLimit(key, 2, 1_000, now + 1);
    const c = fixedWindowRateLimit(key, 2, 1_000, now + 2);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(c.ok).toBe(false);
  });

  it("resets after window", () => {
    const key = getClientKey("127.0.0.2", "test-route");
    const now = 2_000;
    fixedWindowRateLimit(key, 1, 1_000, now);
    const afterReset = fixedWindowRateLimit(key, 1, 1_000, now + 1_001);
    expect(afterReset.ok).toBe(true);
  });

  it("extracts request ip from forwarded headers", () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(getRequestIp(req)).toBe("1.2.3.4");
  });

  it("getRequestIp returns unknown when x-forwarded-for is only whitespace", () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "   \t  " },
    });
    expect(getRequestIp(req)).toBe("unknown");
  });

  it("getClientKey uses unknown for null or empty ip", () => {
    expect(getClientKey(null, "r")).toBe("r:unknown");
    expect(getClientKey("", "r")).toBe("r:unknown");
    expect(getClientKey("  ", "r")).toBe("r:unknown");
  });

  it("getRequestIp handles very long x-forwarded-for without throwing", () => {
    const longList = Array.from({ length: 500 }, () => "1.2.3.4").join(", ");
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": longList },
    });
    expect(getRequestIp(req)).toBe("1.2.3.4");
  });
});
