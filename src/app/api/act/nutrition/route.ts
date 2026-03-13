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
import { recordJudgeTrace } from "@/lib/judgeTrace";
import { searchOpenFoodFacts } from "@/lib/open-food-facts";
import { parseQuantityAndFood, lookupCommonFood } from "@/lib/food-quantity-parser";

export const maxDuration = 300; // Allow up to 5 min for Nova Act browser automation
const TIMEOUT_MS = 280_000; // 280s — leave headroom before Vercel kills the function

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  let food = "unknown";
  try {
    const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "act-nutrition"), 12, 60_000);
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

    // ── Parse quantity from input (e.g. "3 boiled eggs" → quantity:3, food:"boiled egg") ──
    const parsed = parseQuantityAndFood(food);
    const baseFood = parsed.food;
    const quantity = parsed.quantity;

    /** Helper: multiply nutrition values by the parsed quantity */
    const applyQuantity = (n: { calories?: number; protein?: number; carbs?: number; fat?: number }) => ({
      calories: Math.round((n.calories ?? 0) * quantity),
      protein: Math.round((n.protein ?? 0) * quantity),
      carbs: Math.round((n.carbs ?? 0) * quantity * 10) / 10,
      fat: Math.round((n.fat ?? 0) * quantity * 10) / 10,
    });

    // ── Common whole foods first — more accurate than Open Food Facts for rice, chicken, eggs, etc. ──
    const known = lookupCommonFood(baseFood);
    if (known) {
      const nutrition = applyQuantity(known);
      const res = NextResponse.json({
        food,
        nutrition,
        source: "common-foods",
      });
      const headers = getRateLimitHeaderValues(rl);
      res.headers.set("X-RateLimit-Limit", headers.limit);
      res.headers.set("X-RateLimit-Remaining", headers.remaining);
      res.headers.set("X-RateLimit-Reset", headers.reset);
      recordJudgeTrace({
        action: "actNutrition",
        service: "common-foods",
        model: "common-foods",
        status: "ok",
        durationMs: Date.now() - startedAt,
        detail: "common-foods-hit",
      });
      return res;
    }

    if (isJudgeMode()) {
      // Use common foods DB for judge mode instead of hash
      const known = lookupCommonFood(baseFood);
      const nutrition = known
        ? applyQuantity(known)
        : (() => {
            const normalized = food.toLowerCase().trim();
            const hash = normalized.split("").reduce((h, c) => ((h * 31 + c.charCodeAt(0)) >>> 0) % 100000, 0);
            return { calories: 100 + (hash % 400) || 1, protein: 8 + (hash % 45) || 1, carbs: 10 + (hash % 55) || 1, fat: 3 + (hash % 22) || 1 };
          })();
      const res = NextResponse.json({
        food,
        nutrition,
        source: known ? "judge-common-foods" : "judge-fallback",
        demoMode: true,
        note: "JUDGE_MODE deterministic fallback response",
      });
      const headers = getRateLimitHeaderValues(rl);
      res.headers.set("X-RateLimit-Limit", headers.limit);
      res.headers.set("X-RateLimit-Remaining", headers.remaining);
      res.headers.set("X-RateLimit-Reset", headers.reset);
      recordJudgeTrace({
        action: "actNutrition",
        service: "nova-act",
        model: "nova-act",
        status: "fallback",
        durationMs: Date.now() - startedAt,
        detail: "judge-fallback",
      });
      return res;
    }

    // ── DynamoDB nutrition cache (try exact input first, then base food) ──
    try {
      const cached = await dbGetNutritionCache(food) ?? (baseFood !== food ? await dbGetNutritionCache(baseFood) : null);
      if (cached) {
        const isBaseHit = !await dbGetNutritionCache(food).catch(() => null);
        const nutrition = isBaseHit
          ? applyQuantity({ calories: cached.calories, protein: cached.protein, carbs: cached.carbs, fat: cached.fat })
          : { calories: cached.calories, protein: cached.protein, carbs: cached.carbs, fat: cached.fat };
        const res = NextResponse.json({
          food,
          nutrition,
          source: `cache(${cached.source})`,
          cached: true,
        });
        const headers = getRateLimitHeaderValues(rl);
        res.headers.set("X-RateLimit-Limit", headers.limit);
        res.headers.set("X-RateLimit-Remaining", headers.remaining);
        res.headers.set("X-RateLimit-Reset", headers.reset);
        recordJudgeTrace({
          action: "actNutrition",
          service: "cache",
          model: "nutrition-cache",
          status: "ok",
          durationMs: Date.now() - startedAt,
          detail: "cache-hit",
        });
        return res;
      }
    } catch { /* cache miss — continue to live lookup */ }

    // Fast path for common packaged foods before slower Act flows.
    // Try the full input first, then base food name for better matching.
    try {
      const off = await searchOpenFoodFacts(food) ?? (baseFood !== food ? await searchOpenFoodFacts(baseFood) : null);
      if (off) {
        // Cache the per-unit values under the base food name
        dbSaveNutritionCache(baseFood, {
          calories: off.calories,
          protein: off.protein,
          carbs: off.carbs,
          fat: off.fat,
          source: "openfoodfacts",
          cachedAt: new Date().toISOString(),
        }).catch(() => {});
        const nutrition = applyQuantity({
          calories: off.calories,
          protein: off.protein,
          carbs: off.carbs,
          fat: off.fat,
        });
        const res = NextResponse.json({
          food,
          nutrition,
          source: "openfoodfacts",
          productName: off.productName,
        });
        const headers = getRateLimitHeaderValues(rl);
        res.headers.set("X-RateLimit-Limit", headers.limit);
        res.headers.set("X-RateLimit-Remaining", headers.remaining);
        res.headers.set("X-RateLimit-Reset", headers.reset);
        recordJudgeTrace({
          action: "actNutrition",
          service: "open-food-facts",
          model: "open-food-facts",
          status: "ok",
          durationMs: Date.now() - startedAt,
          detail: "openfoodfacts-hit",
        });
        return res;
      }
    } catch {
      // Continue to Act service fallback.
    }

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
      recordJudgeTrace({
        action: "actNutrition",
        service: "nova-act-service",
        model: "nova-act",
        status: serviceResult.error ? "fallback" : "ok",
        durationMs: Date.now() - startedAt,
      });
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
      recordJudgeTrace({
        action: "actNutrition",
        service: "nova-act-local-python",
        model: "nova-act",
        status: "ok",
        durationMs: Date.now() - startedAt,
      });
      return res;
    } catch (actErr) {
      const msg = actErr instanceof Error ? actErr.message : String(actErr);
      const isPythonUnavailable = msg.includes("Python not found") || msg.includes("ENOENT") || msg.includes("spawn");
      const isNovaActMissing = msg.includes("nova-act") || msg.includes("nova_act") || msg.includes("ImportError");
      if (isPythonUnavailable || isNovaActMissing) {
        // Use common foods DB for accurate fallback; only hash for truly unknown foods
        const known = lookupCommonFood(baseFood);
        const nutrition = known
          ? applyQuantity(known)
          : (() => {
              const normalized = food.toLowerCase().trim();
              const hash = normalized.split("").reduce((h, c) => ((h * 31 + c.charCodeAt(0)) >>> 0) % 100000, 0);
              return { calories: 80 + (hash % 450) || 1, protein: 5 + (hash % 45) || 1, carbs: 5 + (hash % 60) || 1, fat: 2 + (hash % 25) || 1 };
            })();
        const res = NextResponse.json({
          food,
          nutrition,
          demoMode: !known,
          source: known ? "common-foods" : "estimated",
          note: known
            ? undefined
            : isNovaActMissing
              ? "Estimated values — run: pip install nova-act"
              : "Estimated values — install Python 3 and Nova Act for USDA lookup",
        });
        const headers = getRateLimitHeaderValues(rl);
        res.headers.set("X-RateLimit-Limit", headers.limit);
        res.headers.set("X-RateLimit-Remaining", headers.remaining);
        res.headers.set("X-RateLimit-Reset", headers.reset);
        recordJudgeTrace({
          action: "actNutrition",
          service: "nova-act-local-python",
          model: "nova-act",
          status: "fallback",
          durationMs: Date.now() - startedAt,
          detail: isNovaActMissing ? "sdk-missing" : "python-missing",
        });
        return res;
      }
      throw actErr;
    }
  } catch (err) {
    console.error("Act nutrition error:", err);
    // Return estimated fallback instead of 500 — UI always gets fillable data
    // Use common foods DB first for accurate values; hash only for truly unknown foods
    const { quantity: errQty, food: errBase } = parseQuantityAndFood(food);
    const errApply = (n: { calories?: number; protein?: number; carbs?: number; fat?: number }) => ({
      calories: Math.round((n.calories ?? 0) * errQty),
      protein: Math.round((n.protein ?? 0) * errQty),
      carbs: Math.round((n.carbs ?? 0) * errQty * 10) / 10,
      fat: Math.round((n.fat ?? 0) * errQty * 10) / 10,
    });
    const errKnown = lookupCommonFood(errBase);
    const nutrition = errKnown
      ? errApply(errKnown)
      : (() => {
          const normalized = food.toLowerCase().trim();
          const hash = normalized.split("").reduce((h, c) => ((h * 31 + c.charCodeAt(0)) >>> 0) % 100000, 0);
          return { calories: 80 + (hash % 450) || 1, protein: 5 + (hash % 45) || 1, carbs: 5 + (hash % 60) || 1, fat: 2 + (hash % 25) || 1 };
        })();
    recordJudgeTrace({
      action: "actNutrition",
      service: "nova-act",
      model: "nova-act",
      status: "fallback",
      durationMs: Date.now() - startedAt,
      detail: "estimated-fallback",
    });
    return NextResponse.json({
      food,
      nutrition,
      demoMode: !errKnown,
      source: errKnown ? "common-foods" : "estimated",
      note: errKnown ? undefined : "Estimated values — lookup encountered an error",
    });
  }
}

