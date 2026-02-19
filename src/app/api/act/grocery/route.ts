import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
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

    const scriptPath = path.join(process.cwd(), "scripts", "nova_act_grocery.py");
    const input = JSON.stringify({
      items: limitedItems,
      store: validStore,
      addToCart: Boolean(addToCart),
    });

    const timeoutMs = addToCart ? TIMEOUT_MS_ADD_TO_CART : TIMEOUT_MS_DEFAULT;
    const result = await runPython(scriptPath, input, timeoutMs);
    const res = NextResponse.json(result);
    const headers = getRateLimitHeaderValues(rl);
    res.headers.set("X-RateLimit-Limit", headers.limit);
    res.headers.set("X-RateLimit-Remaining", headers.remaining);
    res.headers.set("X-RateLimit-Reset", headers.reset);
    return res;
  } catch (err) {
    console.error("Act grocery error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Grocery automation failed" },
      { status: 500 }
    );
  }
}

function runPython(scriptPath: string, stdinData: string, timeoutMs = TIMEOUT_MS_DEFAULT): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const proc = spawn("python3", [scriptPath], {
      env: { ...process.env },
      timeout: timeoutMs,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk) => {
      // Nova Act logs heavily to stderr — this is expected, not an error
      stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      // Nova Act logs go to stderr; only stdout has our JSON output
      const trimmed = stdout.trim();

      // Try to extract the last JSON object from stdout
      // (in case Nova Act leaked anything before our json.dump)
      let jsonStr = trimmed;
      const lastBrace = trimmed.lastIndexOf("}");
      if (lastBrace >= 0) {
        const firstBrace = trimmed.lastIndexOf("{", lastBrace);
        // Find the outermost { that pairs with the last }
        let depth = 0;
        let start = -1;
        for (let i = lastBrace; i >= 0; i--) {
          if (trimmed[i] === "}") depth++;
          else if (trimmed[i] === "{") depth--;
          if (depth === 0) { start = i; break; }
        }
        if (start >= 0) jsonStr = trimmed.slice(start, lastBrace + 1);
      }

      try {
        const data = JSON.parse(jsonStr || "{}");
        if (data.error && code !== 0) {
          reject(new Error(data.error));
          return;
        }
        resolve(data);
      } catch {
        // If stdout has no valid JSON, the script likely timed out or crashed
        const hint = code === null ? "Process timed out" : `Process exited with code ${code}`;
        reject(new Error(`${hint}. Nova Act may need more time — try fewer items or retry.`));
      }
    });

    proc.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ETIMEDOUT") {
        reject(new Error("Nova Act timed out. Try searching fewer items."));
      } else {
        reject(err);
      }
    });

    proc.stdin.write(stdinData);
    proc.stdin.end();
  });
}
