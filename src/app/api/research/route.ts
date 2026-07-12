import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { requireAuthForAI } from "@/lib/judgeMode";
import { rateLimitError, unauthorized, internalError } from "@/lib/api-response";
import { withRequestLogging } from "@/lib/logger";
import { researchQuery } from "@/lib/services/research";

/** Allow up to 60s for web grounding */
export const maxDuration = 60;

async function handleResearch(req: NextRequest, query: string) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "research"), 10, 60_000);
  if (!rl.ok) return rateLimitError("Rate limit exceeded");
  if (requireAuthForAI()) {
    const userId = await getUserId(req.headers);
    if (!userId) return unauthorized();
  }
  try {
    const result = await researchQuery(query);
    return NextResponse.json({ ...result, sources: null });
  } catch (err) {
    console.error("Research error:", err);
    return internalError("Research failed", err);
  }
}

/** iOS client uses GET /api/research?q= */
export const GET = withRequestLogging("/api/research", async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  return handleResearch(req, q);
});

/** Web client uses POST /api/research { query } */
export const POST = withRequestLogging("/api/research", async function POST(req: NextRequest) {
  const { query } = await req.json();
  const q = typeof query === "string" ? query : "";
  return handleResearch(req, q);
});
