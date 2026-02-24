import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { callActService } from "@/lib/act-service";
import { runPython } from "@/lib/act-python";
import {
  fixedWindowRateLimit,
  getClientKey,
  getRateLimitHeaderValues,
  getRequestIp,
} from "@/lib/server-rate-limit";
import { isJudgeMode } from "@/lib/judgeMode";

const TIMEOUT_MS = 60_000; // 60 seconds

export async function POST(req: NextRequest) {
  try {
    const rl = fixedWindowRateLimit(getClientKey(getRequestIp(req), "act-nutrition"), 12, 60_000);
    if (!rl.ok) {
      const headers = getRateLimitHeaderValues(rl);
      const res = NextResponse.json({ error: "Rate limit exceeded. Try again shortly." }, { status: 429 });
      res.headers.set("X-RateLimit-Limit", headers.limit);
      res.headers.set("X-RateLimit-Remaining", headers.remaining);
      res.headers.set("X-RateLimit-Reset", headers.reset);
      res.headers.set("Retry-After", headers.retryAfter);
      return res;
    }

    const { food } = await req.json();
    if (!food || typeof food !== "string") {
      return NextResponse.json({ error: "Food name required" }, { status: 400 });
    }

    if (isJudgeMode()) {
      const normalized = food.toLowerCase().trim();
      const calories = 160 + (normalized.length % 6) * 35;
      const protein = 10 + (normalized.length % 5) * 4;
      const carbs = 12 + (normalized.length % 7) * 3;
      const fat = 4 + (normalized.length % 4) * 2;
      const res = NextResponse.json({
        food,
        nutrition: { calories, protein, carbs, fat },
        source: "judge-fallback",
        demoMode: true,
        note: "JUDGE_MODE deterministic fallback response",
      });
      const headers = getRateLimitHeaderValues(rl);
      res.headers.set("X-RateLimit-Limit", headers.limit);
      res.headers.set("X-RateLimit-Remaining", headers.remaining);
      res.headers.set("X-RateLimit-Reset", headers.reset);
      return res;
    }

    const serviceResult = await callActService<Record<string, unknown>>("/nutrition", { food }, { timeoutMs: TIMEOUT_MS });
    if (serviceResult && (serviceResult.nutrition || serviceResult.error)) {
      const res = NextResponse.json(serviceResult);
      const headers = getRateLimitHeaderValues(rl);
      res.headers.set("X-RateLimit-Limit", headers.limit);
      res.headers.set("X-RateLimit-Remaining", headers.remaining);
      res.headers.set("X-RateLimit-Reset", headers.reset);
      return res;
    }

    const scriptPath = path.join(process.cwd(), "scripts", "nova_act_nutrition.py");
    const input = JSON.stringify({ food });

    try {
      const result = await runPython(scriptPath, input, { timeoutMs: TIMEOUT_MS });
      const res = NextResponse.json(result);
      const headers = getRateLimitHeaderValues(rl);
      res.headers.set("X-RateLimit-Limit", headers.limit);
      res.headers.set("X-RateLimit-Remaining", headers.remaining);
      res.headers.set("X-RateLimit-Reset", headers.reset);
      return res;
    } catch (actErr) {
      const msg = actErr instanceof Error ? actErr.message : String(actErr);
      const isPythonUnavailable = msg.includes("Python not found") || msg.includes("ENOENT") || msg.includes("spawn");
      const isNovaActMissing = msg.includes("nova-act") || msg.includes("nova_act") || msg.includes("ImportError");
      if (isPythonUnavailable || isNovaActMissing) {
        const normalized = food.toLowerCase().trim();
        const res = NextResponse.json({
          food,
          nutrition: { calories: 120 + (normalized.length % 8) * 40, protein: 8 + (normalized.length % 4) * 5, carbs: 10 + (normalized.length % 6) * 4, fat: 4 + (normalized.length % 3) * 3 },
          demoMode: true,
          source: "estimated",
          note: isNovaActMissing
            ? "Estimated values — run: pip install nova-act"
            : "Estimated values — install Python 3 and Nova Act for USDA lookup",
        });
        const headers = getRateLimitHeaderValues(rl);
        res.headers.set("X-RateLimit-Limit", headers.limit);
        res.headers.set("X-RateLimit-Remaining", headers.remaining);
        res.headers.set("X-RateLimit-Reset", headers.reset);
        return res;
      }
      throw actErr;
    }
  } catch (err) {
    console.error("Act nutrition error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Nutrition lookup failed" },
      { status: 500 }
    );
  }
}

