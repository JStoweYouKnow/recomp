import { NextRequest, NextResponse } from "next/server";
import { invokeNova } from "@/lib/nova";
import {
  fixedWindowRateLimit,
  getClientKey,
  getRateLimitHeaderValues,
  getRequestIp,
} from "@/lib/server-rate-limit";

/**
 * Parse a recipe URL to extract name, image, and nutrition per serving.
 *
 * Strategy (in priority order):
 * 1. Firecrawl schema extraction — handles JS-rendered sites, returns structured data directly
 * 2. schema.org Recipe JSON-LD in raw HTML — fast, no external call, works on static sites
 * 3. Nova AI over stripped HTML — last-resort LLM extraction
 */
export async function POST(req: NextRequest) {
  try {
    const rl = await fixedWindowRateLimit(
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
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
      return NextResponse.json(
        { error: "Invalid URL. Use http:// or https://" },
        { status: 400 }
      );
    }

    let name: string | null = null;
    let imageUrl: string | null = null;
    let nutrition: { calories: number; protein: number; carbs: number; fat: number } | null = null;
    let servings = 1;
    let html = "";

    // ── 1. Firecrawl: renders JS, extracts clean content + structured nutrition ──
    if (process.env.FIRECRAWL_API_KEY) {
      try {
        const { default: FirecrawlApp } = await import("@mendable/firecrawl-js");
        const fc = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY });

        const result = await fc.scrape(trimmed, {
          formats: [
            "markdown",
            {
              type: "json",
              schema: {
                type: "object",
                properties: {
                  recipeName: { type: "string", description: "Name of the recipe" },
                  servings: { type: "number", description: "Number of servings the recipe makes" },
                  caloriesPerServing: { type: "number", description: "Calories per serving" },
                  proteinPerServingGrams: { type: "number", description: "Protein in grams per serving" },
                  carbsPerServingGrams: { type: "number", description: "Carbohydrates in grams per serving" },
                  fatPerServingGrams: { type: "number", description: "Fat in grams per serving" },
                  imageUrl: { type: "string", description: "URL of the main recipe image" },
                },
                required: ["recipeName"],
              },
            },
          ],
        });

        const extract = (result as { json?: Record<string, unknown> }).json;
        if (extract) {
          name = typeof extract.recipeName === "string" ? extract.recipeName : null;
          servings = typeof extract.servings === "number" && extract.servings > 0
            ? Math.round(extract.servings) : 1;
          if (
            typeof extract.caloriesPerServing === "number" ||
            typeof extract.proteinPerServingGrams === "number"
          ) {
            nutrition = {
              calories: Math.round(Number(extract.caloriesPerServing) || 0),
              protein: Math.round(Number(extract.proteinPerServingGrams) || 0),
              carbs: Math.round(Number(extract.carbsPerServingGrams) || 0),
              fat: Math.round(Number(extract.fatPerServingGrams) || 0),
            };
          }
          if (!imageUrl && typeof extract.imageUrl === "string") {
            imageUrl = extract.imageUrl;
          }
        }

        // Keep markdown for the Nova fallback if needed
        const md = (result as { markdown?: string }).markdown;
        if (!nutrition && md) {
          html = md; // reuse as clean text for Nova below
        }
      } catch {
        // Firecrawl failed — fall through to raw HTML methods
      }
    }

    // ── 2. Raw HTML fetch + schema.org JSON-LD (static sites, or Firecrawl unavailable) ──
    if (!name || !nutrition) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15_000);
        const res = await fetch(trimmed, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; RefactorRecipeBot/1.0; +https://github.com/JStoweYouKnow/recomp)",
          },
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (res.ok) {
          html = await res.text();
          const baseUrl = new URL(trimmed).origin;

          const schemaMatch = html.match(
            /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
          );

          function parseServings(val: unknown): number {
            if (val == null) return 1;
            if (typeof val === "number") return val > 0 ? Math.round(val) : 1;
            const s = String(val).replace(/\D/g, "");
            const n = parseInt(s, 10);
            return Number.isFinite(n) && n > 0 ? n : 1;
          }

          function extractCalories(val: unknown): number {
            if (val == null) return 0;
            if (typeof val === "number") return Number.isFinite(val) && val >= 0 && val <= 5000 ? val : 0;
            if (typeof val === "object" && val !== null && "value" in (val as object)) {
              return extractCalories((val as { value?: unknown }).value);
            }
            const s = String(val);
            const beforeUnit = s.match(/(\d{2,5})\s*(?:calories?|kcal|cal)\b/i);
            if (beforeUnit) {
              const n = parseInt(beforeUnit[1], 10);
              if (n >= 1 && n <= 5000) return n;
            }
            const firstNum = s.match(/(\d{2,5})/);
            if (firstNum) {
              const n = parseInt(firstNum[1], 10);
              if (n >= 1 && n <= 5000) return n;
            }
            return 0;
          }

          if (schemaMatch) {
            for (const tag of schemaMatch) {
              const content = tag.replace(/<script[^>]*>([\s\S]*?)<\/script>/i, "$1");
              try {
                const parsed = JSON.parse(content);
                const items = parsed["@graph"] ?? (Array.isArray(parsed) ? parsed : [parsed]);
                for (const item of Array.isArray(items) ? items : [items]) {
                  if (!item || typeof item !== "object") continue;
                  const type = item["@type"];
                  if (type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"))) {
                    if (!name) name = item.name ?? item.headline ?? null;
                    if (!servings || servings === 1) {
                      servings = parseServings(item.recipeYield ?? item.yield ?? item.servings ?? 1);
                    }
                    if (!imageUrl) {
                      const img = item.image;
                      if (img) {
                        const first = Array.isArray(img) ? img[0] : img;
                        const candidate =
                          typeof first === "string" ? first : first?.url ?? first?.["@id"] ?? null;
                        if (candidate) {
                          imageUrl = candidate.startsWith("http")
                            ? candidate
                            : new URL(candidate, baseUrl).href;
                        }
                      }
                    }
                    if (!nutrition) {
                      const nut = item.nutrition;
                      if (nut && typeof nut === "object") {
                        const toNum = (val: unknown): number =>
                          typeof val === "number"
                            ? val
                            : typeof val === "string"
                            ? parseFloat(val.replace(/[^\d.]/g, "")) || 0
                            : 0;
                        let cal = extractCalories(nut.calories ?? nut.energyContent);
                        let pro = toNum(nut.proteinContent ?? nut.protein);
                        let carb = toNum(nut.carbohydrateContent ?? nut.carbohydrates ?? nut.carbs);
                        let fat = toNum(nut.fatContent ?? nut.fat);
                        const servingSize = String(nut.servingSize ?? "").toLowerCase();
                        const isTotal =
                          servingSize.includes("recipe") ||
                          servingSize.includes("whole") ||
                          servingSize.includes("entire") ||
                          servingSize.includes("total");
                        if (isTotal && servings > 1) {
                          cal = Math.round(cal / servings);
                          pro = Math.round(pro / servings);
                          carb = Math.round(carb / servings);
                          fat = Math.round(fat / servings);
                        }
                        nutrition = { calories: cal, protein: pro, carbs: carb, fat: fat };
                      }
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

          // og:title / og:image fallbacks
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
        }
      } catch {
        // raw fetch failed — continue to Nova fallback
      }
    }

    // ── 3. Nova: LLM extraction over whatever text we collected ──
    if (!nutrition && html.length > 500) {
      const truncated = (html.startsWith("#") ? html : html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
      ).slice(0, 8000);

      const prompt = `Extract nutrition and serving count from this recipe page. Return ONLY a JSON object with: servings (number), calories (number, per serving), protein (grams, per serving), carbs (grams, per serving), fat (grams, per serving). Divide totals by servings if needed. Use 0 for missing values.

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
          servings = Math.max(1, Math.round(Number(parsed.servings) || 1));
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
      servings,
      nutrition: nutrition ?? { calories: 0, protein: 0, carbs: 0, fat: 0 },
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
