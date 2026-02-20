import { NextRequest, NextResponse } from "next/server";
import { invokeNovaWithWebGroundingOrFallback } from "@/lib/nova";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";

/** Allow up to 60s for web grounding */
export const maxDuration = 60;

const SYSTEM_PROMPT =
  "You are a fitness and nutrition research assistant. Provide evidence-based, detailed answers about nutrition, exercise science, and body recomposition. Cite relevant studies or guidelines where applicable.";

/** Web grounding – Nova searches the web for current nutrition/fitness info.
 *  Falls back to standard Nova inference if web grounding is unavailable. */
export async function POST(req: NextRequest) {
  const rl = fixedWindowRateLimit(getClientKey(getRequestIp(req), "research"), 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  try {
    const { query } = await req.json();
    const q = typeof query === "string" && query.trim() ? query.trim() : "Latest dietary guidelines for protein intake";

    const { text, source } = await invokeNovaWithWebGroundingOrFallback(SYSTEM_PROMPT, q, { temperature: 0.5, maxTokens: 1024 });

    return NextResponse.json({ answer: text, source });
  } catch (err) {
    console.error("Research error:", err);
    return NextResponse.json({ error: "Research failed", detail: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
