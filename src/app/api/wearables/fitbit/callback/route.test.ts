import { describe, it, expect, afterEach } from "vitest";
import { NextRequest } from "next/server";

describe("GET /api/wearables/fitbit/callback", () => {
  afterEach(() => {
    delete process.env.FITBIT_CLIENT_ID;
    delete process.env.FITBIT_CLIENT_SECRET;
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  it("rejects mismatched oauth state", async () => {
    const { GET } = await import("./route");
    const req = new NextRequest(
      "http://localhost/api/wearables/fitbit/callback?code=abc&state=state-from-query",
      {
        headers: {
          cookie: "fitbit_oauth_state=state-from-cookie",
        },
      }
    );
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("invalid_oauth_state");
  });
});
