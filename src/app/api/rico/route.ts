import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { invokeNova } from "@/lib/nova";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { requireAuthForAI } from "@/lib/judgeMode";
import { logInfo, logError } from "@/lib/logger";

const RICO_SYSTEM = `You are Reco, an AI fitness coach for the Recomp app. You're warm, motivating, and genuinely care about the user's progress.

PERSONALITY:
- Supportive and encouraging – celebrate wins, big or small
- Practical – give concrete, actionable advice
- Occasionally stern when needed – if the user has been slacking (missed logs, broken streaks, excuses), give a firm but caring wake-up call. Don't be mean, but don't enable avoidance either.
- Use their name when you know it
- Keep responses concise (2-4 sentences usually). Be punchy.
- Never lecture. Be conversational.

CONTEXT YOU RECEIVE:
The user's message plus optional context about: streak length, meals logged, XP, recent milestones, goal, and whether they've been inconsistent lately.

Respond as Reco. No markdown. No bullet lists unless it's 2-3 quick tips. Be human.`;

export async function POST(req: NextRequest) {
  const rl = fixedWindowRateLimit(getClientKey(getRequestIp(req), "rico"), 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  if (requireAuthForAI()) {
    const userId = await getUserId(req.headers);
    if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    const { message, context } = await req.json();
    const msg = typeof message === "string" ? message : "";
    if (!msg.trim()) return NextResponse.json({ error: "Message required" }, { status: 400 });

    const ctx = context ?? {};
    const userPrompt = `[Context: ${JSON.stringify(ctx)}]\n\nUser: ${msg}`;

    const reply = await invokeNova(RICO_SYSTEM, userPrompt, { temperature: 0.8, maxTokens: 256 });
    logInfo("Rico chat reply", { route: "rico" });
    return NextResponse.json({ reply: reply.trim() });
  } catch (err) {
    logError("Rico chat failed", err, { route: "rico" });
    return NextResponse.json({ error: "Reco is taking a breather. Try again." }, { status: 500 });
  }
}
