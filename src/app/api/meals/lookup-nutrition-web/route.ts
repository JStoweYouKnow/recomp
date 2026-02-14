import { NextRequest, NextResponse } from "next/server";
import { invokeNovaWithWebGrounding } from "@/lib/nova";
import {
  fixedWindowRateLimit,
  getClientKey,
  getRateLimitHeaderValues,
  getRequestIp,
} from "@/lib/server-rate-limit";

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

/** Web-grounded nutrition lookup – infers calories/macros from search results */
export async function POST(req: NextRequest) {
  const rl = fixedWindowRateLimit(
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

    const userMessage = `Search the web for the nutrition facts of this food or meal: "${mealName}". Return calories, protein (g), carbs (g), and fat (g) per typical serving as a JSON object only.`;
    const raw = await invokeNovaWithWebGrounding(
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

    const res = NextResponse.json({
      food: mealName,
      source: "web",
      nutrition: {
        calories: Math.round(nutrition.calories ?? 0),
        protein: Math.round(nutrition.protein ?? 0),
        carbs: Math.round(nutrition.carbs ?? 0),
        fat: Math.round(nutrition.fat ?? 0),
      },
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
