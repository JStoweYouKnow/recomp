/**
 * Regression: in-app Rico chat must persist log_meal server-side (like /api/rico/shortcut),
 * not rely on the mobile client alone — stale sync pulls were wiping meals after chat.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/server-rate-limit", () => ({
  fixedWindowRateLimit: () => ({ ok: true }),
  getClientKey: () => "test-key",
  getRequestIp: () => "127.0.0.1",
}));
vi.mock("@/lib/judgeMode", () => ({ requireAuthForAI: () => false }));
vi.mock("@/lib/logger", () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
  withRequestLogging: (_route: string, handler: unknown) => handler,
}));
vi.mock("@/lib/nova", () => ({ NOVA_LITE_MODEL_ID: "amazon.nova-2-lite-v1:0" }));

const getUserId = vi.fn(async (..._args: unknown[]) => "user-1");
const dbGetMeals = vi.fn(async (..._args: unknown[]) => []);
const dbGetPlan = vi.fn(async (..._args: unknown[]) => null);
const dbSaveMeal = vi.fn(async (..._args: unknown[]) => {});

vi.mock("@/lib/auth", () => ({
  getUserId: (...args: unknown[]) => getUserId(...args),
}));

vi.mock("@/lib/db", () => ({
  dbGetMeals: (...args: unknown[]) => dbGetMeals(...args),
  dbGetPlan: (...args: unknown[]) => dbGetPlan(...args),
  dbSaveMeal: (...args: unknown[]) => dbSaveMeal(...args),
  dbSavePlan: vi.fn(async (..._args: unknown[]) => {}),
  dbGetSavedRecipes: vi.fn(async (..._args: unknown[]) => []),
  dbSaveSavedRecipes: vi.fn(async (..._args: unknown[]) => {}),
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
                input: {
                  name: "Bento box with tempura sweet potato",
                  calories: 650,
                  protein: 28,
                  carbs: 72,
                  fat: 24,
                },
              },
            },
          ],
        },
      },
    });
  },
  ConverseCommand: class {},
}));

describe("POST /api/rico", () => {
  beforeEach(() => {
    dbSaveMeal.mockClear();
  });

  it("persists log_meal and echoes id/date on the action payload", async () => {
    const { POST } = await import("./route");
    const req = new Request("http://localhost/api/rico", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Log a bento box with tempura sweet potato",
        context: { today: "2026-08-19", timezoneOffsetMinutes: 420 },
      }),
    });
    const res = await POST(req as import("next/server").NextRequest);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.reply).toContain("I've logged");
    expect(dbSaveMeal).toHaveBeenCalledTimes(1);
    const [, meal] = dbSaveMeal.mock.calls[0] as [string, { date: string }];
    expect(meal.date).toBe("2026-08-19");
    expect(data.actions).toHaveLength(1);
    expect(typeof data.actions[0].payload.id).toBe("string");
    expect(data.actions[0].payload.date).toBe("2026-08-19");
  });
});
