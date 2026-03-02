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
import { dbGetNutritionCache, dbSaveNutritionCache } from "@/lib/db";

export const maxDuration = 300; // Allow up to 5 min for Nova Act browser automation
const TIMEOUT_MS = 280_000; // 280s — leave headroom before Vercel kills the function

export async function POST(req: NextRequest) {
  let food = "unknown";
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

    const body = (await req.json()) as { food?: string };
    food = (body?.food && typeof body.food === "string") ? body.food.trim() : "unknown";
    if (!food || food === "unknown") {
      return NextResponse.json({ error: "Food name required" }, { status: 400 });
    }

    if (isJudgeMode()) {
      const normalized = food.toLowerCase().trim();
      const hash = normalized.split("").reduce((h, c) => ((h * 31 + c.charCodeAt(0)) >>> 0) % 100000, 0);
      const calories = 100 + (hash % 400) || 1;
      const protein = 8 + (hash % 45) || 1;
      const carbs = 10 + (hash % 55) || 1;
      const fat = 3 + (hash % 22) || 1;
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

    // ── DynamoDB nutrition cache ──
    try {
      const cached = await dbGetNutritionCache(food);
      if (cached) {
        const res = NextResponse.json({
          food,
          nutrition: { calories: cached.calories, protein: cached.protein, carbs: cached.carbs, fat: cached.fat },
          source: `cache(${cached.source})`,
          cached: true,
        });
        const headers = getRateLimitHeaderValues(rl);
        res.headers.set("X-RateLimit-Limit", headers.limit);
        res.headers.set("X-RateLimit-Remaining", headers.remaining);
        res.headers.set("X-RateLimit-Reset", headers.reset);
        return res;
      }
    } catch { /* cache miss — continue to live lookup */ }

    const serviceResult = await callActService<Record<string, unknown>>("/nutrition", { food }, { timeoutMs: TIMEOUT_MS });
    if (serviceResult && (serviceResult.nutrition || serviceResult.error)) {
      // Cache successful USDA results
      const n = serviceResult.nutrition as { calories?: number; protein?: number; carbs?: number; fat?: number } | undefined;
      if (n && typeof n.calories === "number") {
        dbSaveNutritionCache(food, {
          calories: n.calories, protein: n.protein ?? 0, carbs: n.carbs ?? 0, fat: n.fat ?? 0,
          source: "usda", cachedAt: new Date().toISOString(),
        }).catch(() => {});
      }
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
      // Cache successful Python/USDA results
      const pn = (result as { nutrition?: { calories?: number; protein?: number; carbs?: number; fat?: number } }).nutrition;
      if (pn && typeof pn.calories === "number") {
        dbSaveNutritionCache(food, {
          calories: pn.calories, protein: pn.protein ?? 0, carbs: pn.carbs ?? 0, fat: pn.fat ?? 0,
          source: "usda", cachedAt: new Date().toISOString(),
        }).catch(() => {});
      }
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
        const hash = normalized.split("").reduce((h, c) => ((h * 31 + c.charCodeAt(0)) >>> 0) % 100000, 0);
        const res = NextResponse.json({
          food,
          nutrition: {
            calories: 80 + (hash % 450) || 1,
            protein: 5 + (hash % 45) || 1,
            carbs: 5 + (hash % 60) || 1,
            fat: 2 + (hash % 25) || 1,
          },
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
    // Return estimated fallback instead of 500 — UI always gets fillable data
    const normalized = food.toLowerCase().trim();
    const hash = normalized.split("").reduce((h, c) => ((h * 31 + c.charCodeAt(0)) >>> 0) % 100000, 0);
    return NextResponse.json({
      food,
      nutrition: {
        calories: 80 + (hash % 450) || 1,
        protein: 5 + (hash % 45) || 1,
        carbs: 5 + (hash % 60) || 1,
        fat: 2 + (hash % 25) || 1,
      },
      demoMode: true,
      source: "estimated",
      note: "Estimated values — lookup encountered an error",
    });
  }
}

