import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { requireAuthForAI } from "@/lib/judgeMode";
import { logInfo, logError, withRequestLogging } from "@/lib/logger";
import { invokeRico } from "@/lib/services/rico";

export const POST = withRequestLogging("/api/rico", async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "rico"), 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  if (requireAuthForAI()) {
    const userId = await getUserId(req.headers);
    if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    const { message, context, persona } = await req.json();
    const msg = typeof message === "string" ? message.trim() : "";
    if (!msg) return NextResponse.json({ error: "Message required" }, { status: 400 });

    const { reply, actions } = await invokeRico({
      message: msg,
      context: context ?? undefined,
      persona: typeof persona === "string" ? persona : undefined,
    });

    logInfo("Rico chat reply", { route: "rico", persona: persona || "default", actions: actions.length });
    return NextResponse.json({ reply, actions });
  } catch (err) {
    logError("Rico chat failed", err, { route: "rico" });
    return NextResponse.json({ error: "Reco is taking a breather. Try again." }, { status: 500 });
  }
});
