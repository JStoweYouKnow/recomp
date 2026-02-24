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

const TIMEOUT_MS_DEFAULT = 360_000;   // 6 min — search only (~2 acts/item, Nova Act can be slow)
const TIMEOUT_MS_ADD_TO_CART = 480_000; // 8 min — add to cart (~4–5 acts/item)

export async function POST(req: NextRequest) {
  try {
    const rl = fixedWindowRateLimit(getClientKey(getRequestIp(req), "act-grocery"), 8, 60_000);
    if (!rl.ok) {
      const headers = getRateLimitHeaderValues(rl);
      const res = NextResponse.json({ error: "Rate limit exceeded. Try again shortly." }, { status: 429 });
      res.headers.set("X-RateLimit-Limit", headers.limit);
      res.headers.set("X-RateLimit-Remaining", headers.remaining);
      res.headers.set("X-RateLimit-Reset", headers.reset);
      res.headers.set("Retry-After", headers.retryAfter);
      return res;
    }

    const body = await req.json();
    const { items, store, addToCart } = body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Items array required" }, { status: 400 });
    }

    const validStore = ["fresh", "wholefoods", "amazon"].includes(store) ? store : "fresh";
    const maxItems = addToCart ? 2 : 3;
    const limitedItems = items.slice(0, maxItems) as string[];

    if (isJudgeMode()) {
      const demoResults = limitedItems.map((item, index) => ({
        searchTerm: item,
        found: true,
        product: {
          name: `${item} (${validStore})`,
          price: `$${(3.49 + index * 1.25).toFixed(2)}`,
          available: true,
        },
        addedToCart: Boolean(addToCart),
        source: "judge-fallback",
      }));
      const res = NextResponse.json({
        results: demoResults,
        note: "JUDGE_MODE deterministic fallback response",
      });
      const headers = getRateLimitHeaderValues(rl);
      res.headers.set("X-RateLimit-Limit", headers.limit);
      res.headers.set("X-RateLimit-Remaining", headers.remaining);
      res.headers.set("X-RateLimit-Reset", headers.reset);
      return res;
    }

    const timeoutMs = addToCart ? TIMEOUT_MS_ADD_TO_CART : TIMEOUT_MS_DEFAULT;
    const serviceResult = await callActService<{ results?: Array<{ searchTerm?: string; addToCartUrl?: string }>; error?: string }>(
      "/grocery",
      { items: limitedItems, store: validStore, addToCart: Boolean(addToCart) },
      { timeoutMs }
    );
    if (serviceResult && Array.isArray(serviceResult.results) && serviceResult.results.length > 0) {
      const res = NextResponse.json(serviceResult);
      const headers = getRateLimitHeaderValues(rl);
      res.headers.set("X-RateLimit-Limit", headers.limit);
      res.headers.set("X-RateLimit-Remaining", headers.remaining);
      res.headers.set("X-RateLimit-Reset", headers.reset);
      return res;
    }
    // Act service failed (auth, timeout, etc.) — return search links so user can still add items
    if (serviceResult?.error && process.env.ACT_SERVICE_URL) {
      const searchResults = limitedItems.map((item) => ({
        searchTerm: item,
        found: true,
        product: { name: item, price: "—", available: true },
        addedToCart: false,
        addToCartUrl: `https://www.amazon.com/s?k=${encodeURIComponent(item)}`,
        source: "search-fallback",
      }));
      const res = NextResponse.json({
        results: searchResults,
        note: "Search Amazon for each item, then add to cart. Set NOVA_ACT_API_KEY on Railway for full automation.",
      });
      const headers = getRateLimitHeaderValues(rl);
      res.headers.set("X-RateLimit-Limit", headers.limit);
      res.headers.set("X-RateLimit-Remaining", headers.remaining);
      res.headers.set("X-RateLimit-Reset", headers.reset);
      return res;
    }

    const scriptPath = path.join(process.cwd(), "scripts", "nova_act_grocery.py");
    const input = JSON.stringify({
      items: limitedItems,
      store: validStore,
      addToCart: Boolean(addToCart),
    });

    try {
      const result = await runPython(scriptPath, input, { timeoutMs });
      const res = NextResponse.json(result);
      const headers = getRateLimitHeaderValues(rl);
      res.headers.set("X-RateLimit-Limit", headers.limit);
      res.headers.set("X-RateLimit-Remaining", headers.remaining);
      res.headers.set("X-RateLimit-Reset", headers.reset);
      return res;
    } catch (actErr) {
      const msg = actErr instanceof Error ? actErr.message : String(actErr);
      const isPythonUnavailable = msg.includes("Python not found") || msg.includes("ENOENT") || msg.includes("spawn");
      const isNovaActMissing = msg.includes("nova-act") || msg.includes("nova_act");
      if (isPythonUnavailable || isNovaActMissing) {
        const res = NextResponse.json({
          results: limitedItems.map((item) => ({
            searchTerm: item,
            found: false,
            product: null,
            addedToCart: false,
            source: "fallback",
          })),
          note: isNovaActMissing
            ? "Nova Act SDK not installed. Run: pip install nova-act"
            : "Python not found. Install Python 3 (e.g. brew install python3) or set ACT_PYTHON=/path/to/python",
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
    console.error("Act grocery error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Grocery automation failed" },
      { status: 500 }
    );
  }
}

