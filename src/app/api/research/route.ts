import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { requireAuthForAI } from "@/lib/judgeMode";
import { rateLimitError, unauthorized, internalError } from "@/lib/api-response";
import { withRequestLogging } from "@/lib/logger";
import { researchQuery } from "@/lib/services/research";

/** Allow up to 60s for web grounding */
export const maxDuration = 60;

/** Web grounding – Nova searches the web for current nutrition/fitness info.
 *  Falls back to standard Nova inference if web grounding is unavailable. */
export const POST = withRequestLogging("/api/research", async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "research"), 10, 60_000);
  if (!rl.ok) return rateLimitError("Rate limit exceeded");
  if (requireAuthForAI()) {
    const userId = await getUserId(req.headers);
    if (!userId) return unauthorized();
  }

  try {
    const { query } = await req.json();
    const q = typeof query === "string" ? query : "";
    const result = await researchQuery(q);
    return NextResponse.json(result);
  } catch (err) {
    console.error("Research error:", err);
    return internalError("Research failed", err);
  }
});
