import { NextRequest, NextResponse } from "next/server";
import { invokeNova } from "@/lib/nova";
import {
  fixedWindowRateLimit,
  getClientKey,
  getRateLimitHeaderValues,
  getRequestIp,
} from "@/lib/server-rate-limit";

/**
 * Parse a recipe URL to extract name, image, and nutrition.
 * Uses schema.org Recipe JSON-LD when available, og meta tags as fallback,
 * and Nova AI for pages without structured data.
 */
export async function POST(req: NextRequest) {
  try {
    const rl = fixedWindowRateLimit(
      getClientKey(getRequestIp(req), "parse-recipe-url"),
      15,
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

    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL required" }, { status: 400 });
    }

    const trimmed = url.trim();
    if (
      !trimmed.startsWith("http://") &&
      !trimmed.startsWith("https://")
    ) {
      return NextResponse.json(
        { error: "Invalid URL. Use http:// or https://" },
        { status: 400 }
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    const res = await fetch(trimmed, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; RecompRecipeBot/1.0; +https://github.com/recomp)",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json(
        { error: `Could not fetch URL: ${res.status}` },
        { status: 422 }
      );
    }

    const html = await res.text();
    const baseUrl = new URL(trimmed).origin;

    // 1. Try schema.org Recipe JSON-LD
    const schemaMatch = html.match(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    );
    let name: string | null = null;
    let imageUrl: string | null = null;
    let nutrition: { calories?: number; protein?: number; carbs?: number; fat?: number } | null = null;

    if (schemaMatch) {
      for (const tag of schemaMatch) {
        const content = tag.replace(
          /<script[^>]*>([\s\S]*?)<\/script>/i,
          "$1"
        );
        try {
          const parsed = JSON.parse(content);
          const items = parsed["@graph"] ?? (Array.isArray(parsed) ? parsed : [parsed]);
          for (const item of Array.isArray(items) ? items : [items]) {
            if (!item || typeof item !== "object") continue;
            const type = item["@type"];
            if (
              type === "Recipe" ||
              (Array.isArray(type) && type.includes("Recipe"))
            ) {
              name = item.name ?? item.headline ?? null;
              const img = item.image;
              if (img) {
                const first = Array.isArray(img) ? img[0] : img;
                imageUrl = typeof first === "string" ? first : first?.url ?? first?.["@id"] ?? null;
                if (imageUrl && !imageUrl.startsWith("http")) {
                  imageUrl = new URL(imageUrl, baseUrl).href;
                }
              }
              const nut = item.nutrition;
              if (nut && typeof nut === "object") {
                const toNum = (val: unknown): number =>
                  typeof val === "number" ? val : typeof val === "string" ? parseFloat(val.replace(/[^\d.]/g, "")) || 0 : 0;
                const cals = nut.calories ?? nut.energyContent;
                const calNum = typeof cals === "number" ? cals : typeof cals === "string" ? parseInt(cals.replace(/\D/g, ""), 10) : NaN;
                nutrition = {
                  calories: Number.isFinite(calNum) ? calNum : toNum(cals),
                  protein: toNum(nut.proteinContent ?? nut.protein),
                  carbs: toNum(nut.carbohydrateContent ?? nut.carbohydrates ?? nut.carbs),
                  fat: toNum(nut.fatContent ?? nut.fat),
                };
              }
              if (name) break;
            }
          }
          if (name) break;
        } catch {
          /* skip invalid JSON */
        }
      }
    }

    // 2. Fallback: og meta tags
    if (!name) {
      const ogTitle = html.match(
        /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i
      );
      name = ogTitle?.[1] ?? null;
    }
    if (!imageUrl) {
      const ogImage = html.match(
        /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i
      );
      const img = ogImage?.[1];
      if (img) {
        imageUrl = img.startsWith("http") ? img : new URL(img, baseUrl).href;
      }
    }

    // 3. If we have HTML but missing nutrition, use Nova to extract
    if (!nutrition && html.length > 500) {
      const truncated = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 8000);
      const prompt = `Extract nutrition from this recipe page excerpt. Return ONLY a JSON object with: calories (number), protein (grams), carbs (grams), fat (grams). Use 0 for missing values. If no nutrition info found, return {"calories":0,"protein":0,"carbs":0,"fat":0}.

PAGE EXCERPT:
${truncated}`;
      try {
        const raw = await invokeNova(
          "You are a nutrition extractor. Return only valid JSON.",
          prompt
        );
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          nutrition = {
            calories: Math.round(Number(parsed.calories) || 0),
            protein: Math.round(Number(parsed.protein) || 0),
            carbs: Math.round(Number(parsed.carbs) || 0),
            fat: Math.round(Number(parsed.fat) || 0),
          };
        }
      } catch {
        nutrition = null;
      }
    }

    const result = {
      name: name || "Recipe",
      imageUrl: imageUrl || undefined,
      nutrition: nutrition ?? {
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
      },
    };

    const headers = getRateLimitHeaderValues(rl);
    const response = NextResponse.json(result);
    response.headers.set("X-RateLimit-Limit", headers.limit);
    response.headers.set("X-RateLimit-Remaining", headers.remaining);
    response.headers.set("X-RateLimit-Reset", headers.reset);
    return response;
  } catch (err) {
    console.error("Parse recipe URL error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to parse recipe" },
      { status: 500 }
    );
  }
}
