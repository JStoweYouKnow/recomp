import { NextRequest, NextResponse } from "next/server";
import { invokeNovaWithWebGrounding } from "@/lib/nova";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";

/** Web grounding – Nova searches the web for current nutrition/fitness info */
export async function POST(req: NextRequest) {
  const rl = fixedWindowRateLimit(getClientKey(getRequestIp(req), "research"), 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  try {
    const { query } = await req.json();
    const q = typeof query === "string" ? query : "Latest dietary guidelines for protein intake";
    const text = await invokeNovaWithWebGrounding(
      "You are a fitness and nutrition research assistant. Answer based on current web search results. Cite sources.",
      q,
      { temperature: 0.5, maxTokens: 1024 }
    );
    return NextResponse.json({ answer: text });
  } catch (err) {
    console.error("Research error:", err);
    return NextResponse.json({ error: "Research failed" }, { status: 500 });
  }
}
