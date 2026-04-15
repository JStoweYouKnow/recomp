/**
 * Integration test: Rico AI coach flow
 * Verifies the chat endpoint accepts messages and returns valid replies.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/server-rate-limit", () => ({
  fixedWindowRateLimit: () => ({ ok: true }),
  getClientKey: () => "test-key",
  getRequestIp: () => "127.0.0.1",
}));
vi.mock("@aws-sdk/client-bedrock-runtime", () => {
  return {
    BedrockRuntimeClient: class {
      send = vi.fn().mockResolvedValue({
        output: {
          message: {
            content: [
              { text: "Keep it up! You're doing great with your consistency." }
            ]
          }
        }
      });
    },
    ConverseCommand: class {}
  };
});
vi.mock("@/lib/nova", () => ({ NOVA_LITE_MODEL_ID: "amazon.nova-2-lite-v1:0" }));

describe("Rico flow integration", () => {
  it("accepts a message and returns a reply", async () => {
    const { POST } = await import("@/app/api/rico/route");
    const req = new Request("http://localhost/api/rico", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "How am I doing?", context: { streak: 3 } }),
    });
    const res = await POST(req as import("next/server").NextRequest);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.reply).toBeDefined();
    expect(typeof data.reply).toBe("string");
    expect(data.reply.length).toBeGreaterThan(0);
  });

  it("rejects empty message", async () => {
    const { POST } = await import("@/app/api/rico/route");
    const req = new Request("http://localhost/api/rico", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "   " }),
    });
    const res = await POST(req as import("next/server").NextRequest);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBeDefined();
  });

  it("returns 500 when body is not valid JSON", async () => {
    const { POST } = await import("@/app/api/rico/route");
    const req = new Request("http://localhost/api/rico", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req as import("next/server").NextRequest);
    expect(res.status).toBe(500);
  });
});
