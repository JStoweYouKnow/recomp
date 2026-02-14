import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  getUserId: vi.fn(),
}));

describe("POST /api/wearables/apple/healthkit", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.APPLE_HEALTH_INGEST_KEY;
  });

  it("requires authentication", async () => {
    const { getUserId } = await import("@/lib/auth");
    vi.mocked(getUserId).mockResolvedValue(null);
    const { POST } = await import("./route");
    const req = new Request("http://localhost/api/wearables/apple/healthkit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ samples: [] }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(401);
  });

  it("normalizes apple healthkit quantity samples", async () => {
    const { getUserId } = await import("@/lib/auth");
    vi.mocked(getUserId).mockResolvedValue("user-1");
    const { POST } = await import("./route");
    const req = new Request("http://localhost/api/wearables/apple/healthkit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        samples: [
          {
            quantityTypeIdentifier: "HKQuantityTypeIdentifierStepCount",
            value: 4210,
            startDate: "2026-02-10T06:00:00.000Z",
          },
          {
            quantityTypeIdentifier: "HKQuantityTypeIdentifierBasalEnergyBurned",
            value: 1800,
            startDate: "2026-02-10T06:00:00.000Z",
          },
          {
            quantityTypeIdentifier: "HKQuantityTypeIdentifierHeartRate",
            value: 62,
            startDate: "2026-02-10T06:00:00.000Z",
          },
        ],
      }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.provider).toBe("apple");
    expect(body.count).toBe(1);
    expect(body.data[0]).toMatchObject({
      date: "2026-02-10",
      provider: "apple",
      steps: 4210,
      caloriesBurned: 1800,
      heartRateAvg: 62,
    });
  });

  it("validates optional ingest key when configured", async () => {
    process.env.APPLE_HEALTH_INGEST_KEY = "secret";
    const { getUserId } = await import("@/lib/auth");
    vi.mocked(getUserId).mockResolvedValue("user-1");
    const { POST } = await import("./route");
    const req = new Request("http://localhost/api/wearables/apple/healthkit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        samples: [{ quantityTypeIdentifier: "HKQuantityTypeIdentifierStepCount", value: 1, date: "2026-02-10" }],
      }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(401);
  });
});
