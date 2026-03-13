import { NextRequest, NextResponse } from "next/server";
import { invokeNovaWithWebGroundingOrFallback } from "@/lib/nova";
import {
  fixedWindowRateLimit,
  getClientKey,
  getRateLimitHeaderValues,
  getRequestIp,
} from "@/lib/server-rate-limit";
import { dbGetNutritionCache, dbSaveNutritionCache } from "@/lib/db";
import { parseQuantityAndFood, lookupCommonFood } from "@/lib/food-quantity-parser";

/** Allow up to 60s for web grounding (default Vercel timeout is too short) */
export const maxDuration = 60;

const SYSTEM_PROMPT = `You are a nutrition analyst. Search the web for accurate nutrition information for foods and meals.
Return ONLY a valid JSON object with these keys: calories, protein, carbs, fat (all numbers).
Use typical serving sizes for the dish (e.g., one burrito, one bowl, one sandwich).
If the dish has common variations, use the most typical version.
Respond with nothing but the JSON object.`;

function parseJsonResponse(text: string): { calories?: number; protein?: number; carbs?: number; fat?: number } {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return {};
  try {
    const obj = JSON.parse(match[0]);
    return {
      calories: typeof obj.calories === "number" ? obj.calories : typeof obj.calories === "string" ? parseInt(obj.calories, 10) : undefined,
      protein: typeof obj.protein === "number" ? obj.protein : typeof obj.protein === "string" ? parseInt(obj.protein, 10) : undefined,
      carbs: typeof obj.carbs === "number" ? obj.carbs : typeof obj.carbs === "string" ? parseInt(obj.carbs, 10) : undefined,
      fat: typeof obj.fat === "number" ? obj.fat : typeof obj.fat === "string" ? parseInt(obj.fat, 10) : undefined,
    };
  } catch {
    return {};
  }
}

/** Web-grounded nutrition lookup: cache → Nova web grounding (same flow as before Open Food Facts) */
export async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(
    getClientKey(getRequestIp(req), "meals-lookup-web"),
    20,
    60_000
  );
  if (!rl.ok) {
    const headers = getRateLimitHeaderValues(rl);
    const res = NextResponse.json(
      { error: "Rate limit exceeded. Try again shortly." },
      { status: 429 }
    );
    res.headers.set("X-RateLimit-Limit", headers.limit);
    res.headers.set("X-RateLimit-Remaining", headers.remaining);
    res.headers.set("X-RateLimit-Reset", headers.reset);
    res.headers.set("Retry-After", headers.retryAfter);
    return res;
  }

  try {
    const { food } = await req.json();
    const mealName = typeof food === "string" ? food.trim() : "";
    if (!mealName) {
      return NextResponse.json({ error: "Food name required" }, { status: 400 });
    }

    // ── Parse quantity (e.g. "3 boiled eggs" → quantity:3, food:"boiled egg") ──
    const parsed = parseQuantityAndFood(mealName);
    const baseFood = parsed.food;
    const quantity = parsed.quantity;

    const applyQuantity = (n: { calories?: number; protein?: number; carbs?: number; fat?: number }) => ({
      calories: Math.round((n.calories ?? 0) * quantity),
      protein: Math.round((n.protein ?? 0) * quantity),
      carbs: Math.round((n.carbs ?? 0) * quantity * 10) / 10,
      fat: Math.round((n.fat ?? 0) * quantity * 10) / 10,
    });

    // ── 0. Common whole foods first — accurate for rice, chicken, eggs, etc. ──
    const known = lookupCommonFood(baseFood);
    if (known) {
      const nutrition = applyQuantity(known);
      const res = NextResponse.json({
        food: mealName,
        source: "common-foods",
        nutrition,
        found: true,
      });
      const headers = getRateLimitHeaderValues(rl);
      res.headers.set("X-RateLimit-Limit", headers.limit);
      res.headers.set("X-RateLimit-Remaining", headers.remaining);
      res.headers.set("X-RateLimit-Reset", headers.reset);
      return res;
    }

    // ── 1. DynamoDB nutrition cache (try exact input, then base food) ──
    try {
      const cached = await dbGetNutritionCache(mealName) ?? (baseFood !== mealName ? await dbGetNutritionCache(baseFood) : null);
      if (cached) {
        const isBaseHit = !await dbGetNutritionCache(mealName).catch(() => null);
        const nutrition = isBaseHit
          ? applyQuantity({ calories: cached.calories, protein: cached.protein, carbs: cached.carbs, fat: cached.fat })
          : { calories: cached.calories, protein: cached.protein, carbs: cached.carbs, fat: cached.fat };
        const res = NextResponse.json({
          food: mealName,
          source: `cache(${cached.source})`,
          nutrition,
          found: true,
          cached: true,
        });
        const headers = getRateLimitHeaderValues(rl);
        res.headers.set("X-RateLimit-Limit", headers.limit);
        res.headers.set("X-RateLimit-Remaining", headers.remaining);
        res.headers.set("X-RateLimit-Reset", headers.reset);
        return res;
      }
    } catch { /* cache miss — continue to live lookup */ }

    // ── 2. Nova web grounding ──
    // Ask for per-unit nutrition so we can multiply by quantity for accuracy
    const quantityNote = quantity !== 1 ? ` The user asked about ${quantity} units — return nutrition for ONE single ${baseFood} only, and I will multiply.` : "";
    const userMessage = `Search the web for the nutrition facts of this food or meal: "${baseFood}".${quantityNote} Return calories, protein (g), carbs (g), and fat (g) per typical single serving as a JSON object only.`;
    const { text: raw, source } = await invokeNovaWithWebGroundingOrFallback(
      SYSTEM_PROMPT,
      userMessage,
      { temperature: 0.3, maxTokens: 512 }
    );

    const nutrition = parseJsonResponse(raw);
    const hasAny = [nutrition.calories, nutrition.protein, nutrition.carbs, nutrition.fat].some(
      (v) => typeof v === "number" && Number.isFinite(v)
    );
    if (!hasAny) {
      return NextResponse.json(
        { error: "Could not extract nutrition from web results. Try a more specific meal name." },
        { status: 422 }
      );
    }

    // Per-unit values from web grounding
    const perUnit = {
      calories: Math.round(nutrition.calories ?? 0),
      protein: Math.round(nutrition.protein ?? 0),
      carbs: Math.round(nutrition.carbs ?? 0),
      fat: Math.round(nutrition.fat ?? 0),
    };

    // Cache per-unit values under the base food name
    dbSaveNutritionCache(baseFood, {
      ...perUnit, source: source ?? "web-grounding", cachedAt: new Date().toISOString(),
    }).catch(() => {});

    // Apply quantity multiplier for the final response
    const finalNutrition = applyQuantity(perUnit);

    const res = NextResponse.json({
      food: mealName,
      source,
      nutrition: finalNutrition,
      found: true,
    });
    const headers = getRateLimitHeaderValues(rl);
    res.headers.set("X-RateLimit-Limit", headers.limit);
    res.headers.set("X-RateLimit-Remaining", headers.remaining);
    res.headers.set("X-RateLimit-Reset", headers.reset);
    return res;
  } catch (err) {
    console.error("Meals lookup-nutrition-web error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Web nutrition lookup failed" },
      { status: 500 }
    );
  }
}
