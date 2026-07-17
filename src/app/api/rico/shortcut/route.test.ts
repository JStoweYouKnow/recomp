/**
 * Regression test: the Siri Shortcuts / SMS "headless" Rico endpoint has no
 * client-side store to apply tool actions into, so it must persist `log_meal`
 * itself. Previously it discarded `actions` entirely — Rico would confirm the
 * meal was logged but nothing was ever saved.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/server-rate-limit", () => ({
  fixedWindowRateLimit: () => ({ ok: true }),
  getClientKey: () => "test-key",
  getRequestIp: () => "127.0.0.1",
}));
vi.mock("@/lib/nova", () => ({ NOVA_LITE_MODEL_ID: "amazon.nova-2-lite-v1:0" }));

const dbGetUserIdByApiToken = vi.fn(async () => "user-1");
const dbGetMeals = vi.fn(async () => []);
const dbGetPlan = vi.fn(async () => null);
const dbGetProfile = vi.fn(async () => null);
const dbGetMeta = vi.fn(async () => ({}));
const dbSaveMeal = vi.fn(async () => {});

vi.mock("@/lib/db", () => ({
  dbGetUserIdByApiToken: (...args: unknown[]) => dbGetUserIdByApiToken(...args),
  dbGetMeals: (...args: unknown[]) => dbGetMeals(...args),
  dbGetPlan: (...args: unknown[]) => dbGetPlan(...args),
  dbGetProfile: (...args: unknown[]) => dbGetProfile(...args),
  dbGetMeta: (...args: unknown[]) => dbGetMeta(...args),
  dbSaveMeal: (...args: unknown[]) => dbSaveMeal(...args),
}));

vi.mock("@aws-sdk/client-bedrock-runtime", () => ({
  BedrockRuntimeClient: class {
    send = vi.fn().mockResolvedValue({
      output: {
        message: {
          content: [
            {
              toolUse: {
                name: "log_meal",
                input: { name: "Grilled chicken salad", calories: 450, protein: 40, carbs: 20, fat: 18 },
              },
            },
          ],
        },
      },
    });
  },
  ConverseCommand: class {},
}));

describe("POST /api/rico/shortcut", () => {
  beforeEach(() => {
    dbSaveMeal.mockClear();
  });

  it("persists a log_meal tool action to the database", async () => {
    const { POST } = await import("./route");
    const req = new Request("http://localhost/api/rico/shortcut", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" },
      body: JSON.stringify({ message: "log a grilled chicken salad" }),
    });
    const res = await POST(req as import("next/server").NextRequest);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(typeof data.reply).toBe("string");
    expect(dbSaveMeal).toHaveBeenCalledTimes(1);
    const [userId, meal] = dbSaveMeal.mock.calls[0];
    expect(userId).toBe("user-1");
    expect(meal).toMatchObject({
      name: "Grilled chicken salad",
      macros: { calories: 450, protein: 40, carbs: 20, fat: 18 },
    });
  });
});
