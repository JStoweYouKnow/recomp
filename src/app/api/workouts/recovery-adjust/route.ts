import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { logError } from "@/lib/logger";
import { rateLimitError, unauthorized, internalError } from "@/lib/api-response";
import { assessRecovery } from "@/lib/services/workouts";

export async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "recovery-adjust"), 10, 60_000);
  if (!rl.ok) return rateLimitError("Rate limit exceeded");

  const userId = await getUserId(req.headers);
  if (!userId) return unauthorized();

  try {
    const body = await req.json();
    const assessment = await assessRecovery(body);
    return NextResponse.json(assessment);
  } catch (err) {
    logError("Recovery adjust failed", err, { route: "workouts/recovery-adjust" });
    return internalError("Recovery assessment failed", err);
  }
}
