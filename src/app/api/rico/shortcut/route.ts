import { NextRequest, NextResponse } from "next/server";
import { dbGetUserIdByApiToken } from "@/lib/db";
import { dbGetMeals, dbGetPlan, dbGetProfile, dbGetMeta } from "@/lib/db";
import { invokeRico, buildRicoContextFromServer } from "@/lib/services/rico";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { logError } from "@/lib/logger";

/**
 * Token-based Rico endpoint for Siri Shortcuts and other headless clients.
 * POST with Authorization: Bearer <your-api-token> and body { message: "..." }
 */
export async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "rico-shortcut"), 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "Authorization required. Use Bearer <api-token>." }, { status: 401 });
  }

  const userId = await dbGetUserIdByApiToken(token);
  if (!userId) {
    return NextResponse.json({ error: "Invalid or expired token. Generate a new one in Profile → Rico on the go." }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!message) {
      return NextResponse.json({ error: "message required" }, { status: 400 });
    }

    const [meals, plan, profile, meta] = await Promise.all([
      dbGetMeals(userId),
      dbGetPlan(userId),
      dbGetProfile(userId),
      dbGetMeta(userId),
    ]);

    const context = buildRicoContextFromServer({
      meals,
      plan,
      profile: profile ?? undefined,
      meta,
    });

    const { reply } = await invokeRico({
      message,
      context,
    });

    return NextResponse.json({ reply });
  } catch (err) {
    logError("Rico shortcut failed", err, { userId: userId.slice(0, 8) });
    return NextResponse.json({ error: "Reco is taking a breather. Try again." }, { status: 500 });
  }
}
