import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("GET /api/wearables/fitbit/auth", () => {
  const originalClientId = process.env.FITBIT_CLIENT_ID;

  beforeEach(() => {
    process.env.FITBIT_CLIENT_ID = "fitbit-client";
  });

  afterEach(() => {
    process.env.FITBIT_CLIENT_ID = originalClientId;
    vi.resetModules();
  });

  it("sets oauth state cookie and redirects with same state", async () => {
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(307);

    const location = res.headers.get("location");
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(location).toContain("fitbit.com/oauth2/authorize");
    expect(setCookie).toContain("fitbit_oauth_state=");

    const stateInUrl = new URL(location ?? "").searchParams.get("state");
    expect(stateInUrl).toBeTruthy();
    expect(setCookie).toContain(`fitbit_oauth_state=${stateInUrl}`);
  });
});
