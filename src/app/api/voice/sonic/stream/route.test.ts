import { describe, it, expect, vi } from "vitest";

vi.mock("@aws-sdk/client-bedrock-runtime", () => ({
  BedrockRuntimeClient: vi.fn(),
  InvokeModelWithBidirectionalStreamCommand: vi.fn(),
}));

describe("POST /api/voice/sonic/stream", () => {
  it("returns 400 when request body is missing", async () => {
    const { POST } = await import("./route");
    const req = new Request("http://localhost/api/voice/sonic/stream", {
      method: "POST",
      body: null,
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(400);
  });
});
