import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { invokeNova } from "@/lib/nova";
import {
  fixedWindowRateLimit,
  getClientKey,
  getRateLimitHeaderValues,
  getRequestIp,
} from "@/lib/server-rate-limit";

/**
 * Cooking App Data Import
 *
 * Accepts CSV or JSON exports from popular cooking / nutrition apps and
 * uses Nova AI to normalize them into standard MealEntry format.
 *
 * Supports:
 *   - Cronometer CSV/JSON
 *   - MyFitnessPal CSV
 *   - Yummly JSON
 *   - LoseIt CSV
 *   - Generic JSON (ingredients + macros)
 *   - Plain text recipe / meal descriptions
 */

const SYSTEM_PROMPT = `You are a nutrition data normalizer. You receive raw exported data from cooking and nutrition tracking apps. Parse it and return a JSON array of meals.

Each meal must have this exact structure:
{
  "name": "string (meal/recipe name)",
  "mealType": "breakfast" | "lunch" | "dinner" | "snack",
  "date": "YYYY-MM-DD",
  "macros": {
    "calories": number,
    "protein": number (grams),
    "carbs": number (grams),
    "fat": number (grams)
  },
  "notes": "string (optional, include fiber/sugar/sodium if available)"
}

Rules:
- If meal type is unknown, infer from context or time
- If date is missing, use today's date
- Round all macro values to integers
- If macros are missing, estimate based on ingredients
- Respond with ONLY a JSON array, no other text`;

export async function POST(req: NextRequest) {
  try {
    const rl = fixedWindowRateLimit(
      getClientKey(getRequestIp(req), "cooking-import"),
      10,
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

    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const contentType = req.headers.get("content-type") ?? "";
    let rawData: string;
    let sourceFormat: string;

    if (contentType.includes("multipart/form-data")) {
      // File upload
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json(
          { error: "File required" },
          { status: 400 }
        );
      }
      if (file.size > 2 * 1024 * 1024) {
        return NextResponse.json(
          { error: "File too large (max 2MB)" },
          { status: 413 }
        );
      }
      rawData = await file.text();
      sourceFormat = file.name.endsWith(".csv")
        ? "CSV"
        : file.name.endsWith(".json")
          ? "JSON"
          : "TEXT";
    } else {
      // Direct JSON body
      const body = await req.json();
      if (!body.data || typeof body.data !== "string") {
        return NextResponse.json(
          { error: "Missing 'data' field with exported content" },
          { status: 400 }
        );
      }
      rawData = body.data;
      sourceFormat = body.format ?? "AUTO";
    }

    if (!rawData.trim()) {
      return NextResponse.json(
        { error: "Empty data" },
        { status: 400 }
      );
    }

    // Truncate very large payloads to prevent token overflow
    const truncated = rawData.slice(0, 15_000);

    const prompt = `Parse this ${sourceFormat} exported data from a cooking/nutrition app. Today's date is ${new Date().toISOString().slice(0, 10)}.

DATA:
${truncated}`;

    const raw = await invokeNova(SYSTEM_PROMPT, prompt);
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) {
      return NextResponse.json(
        { error: "Could not parse exported data. Try a different format." },
        { status: 422 }
      );
    }

    const parsed = JSON.parse(match[0]);
    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    const mealEntries = (Array.isArray(parsed) ? parsed : [parsed]).map(
      (m: Record<string, unknown>, i: number) => ({
        id: `import_${Date.now()}_${i}`,
        date: (m.date as string) ?? today,
        mealType: m.mealType ?? "snack",
        name: (m.name as string) ?? "Imported meal",
        macros: {
          calories: Math.round(Number((m.macros as Record<string, number>)?.calories) || 0),
          protein: Math.round(Number((m.macros as Record<string, number>)?.protein) || 0),
          carbs: Math.round(Number((m.macros as Record<string, number>)?.carbs) || 0),
          fat: Math.round(Number((m.macros as Record<string, number>)?.fat) || 0),
        },
        notes: (m.notes as string) ?? "Imported from cooking app",
        loggedAt: now,
      })
    );

    const res = NextResponse.json({
      imported: mealEntries.length,
      meals: mealEntries,
    });
    const headers = getRateLimitHeaderValues(rl);
    res.headers.set("X-RateLimit-Limit", headers.limit);
    res.headers.set("X-RateLimit-Remaining", headers.remaining);
    res.headers.set("X-RateLimit-Reset", headers.reset);
    return res;
  } catch (err) {
    console.error("Cooking import error:", err);
    return NextResponse.json(
      { error: "Import failed" },
      { status: 500 }
    );
  }
}
