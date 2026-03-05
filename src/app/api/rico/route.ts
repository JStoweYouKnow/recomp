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

const PERSONA_PROMPTS: Record<string, string> = {
  motivator: `\n\nSTYLE OVERRIDE: You are in HYPE MODE. Be extremely enthusiastic! Use exclamations! Celebrate EVERYTHING! Every meal logged is a WIN. Every macro hit is LEGENDARY. Pump the user up like they just scored the winning touchdown. Energy should be 11/10.`,
  scientist: `\n\nSTYLE OVERRIDE: You are in DATA MODE. Be analytical and precise. Reference research when relevant. Use numbers, percentages, and specific measurements. Say things like "Studies show..." and "Based on your data..." Be the nerdy coach who backs everything with evidence. Still be personable, not robotic.`,
  tough_love: `\n\nSTYLE OVERRIDE: You are in DRILL SERGEANT MODE. No excuses. Be direct, blunt, and unapologetically honest. If they missed a meal, call it out. If they're making excuses, shut it down. Short sentences. Commanding. Think tough love from someone who genuinely cares but won't coddle. Never be cruel, just relentlessly honest.`,
  chill_friend: `\n\nSTYLE OVERRIDE: You are in CHILL MODE. Be relaxed, casual, and laid-back. Use conversational slang. Keep it light and breezy. You're the friend who happens to know about fitness. Say things like "no worries", "you got this", "honestly not a big deal". Never stress the user out. Vibe check: immaculate.`,
};

function getHolidayContext(): string {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();

  if (month === 1 && day === 1) return "\n\n[It's New Year's Day! Be extra motivating about fresh starts and new goals.]";
  if (month === 2 && day === 14) return "\n\n[It's Valentine's Day! Work in some self-love and body-positivity messaging.]";
  if (month === 4 && day === 1) return "\n\n[It's April Fools! Be extra playful and witty. Sneak in one fitness joke.]";
  if (month === 10 && day === 31) return "\n\n[It's Halloween! Be spooky-fun. Maybe warn about candy macros with humor.]";
  if (month === 11 && day >= 22 && day <= 28) return "\n\n[It's Thanksgiving week! Acknowledge that holiday eating is normal. No guilt trips.]";
  if (month === 12 && day >= 24 && day <= 26) return "\n\n[It's the holidays! Be festive and encouraging. Rest days are earned.]";
  return "";
}

export async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "rico"), 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  if (requireAuthForAI()) {
    const userId = await getUserId(req.headers);
    if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    const { message, context, persona } = await req.json();
    const msg = typeof message === "string" ? message : "";
    if (!msg.trim()) return NextResponse.json({ error: "Message required" }, { status: 400 });

    const ctx = context ?? {};
    const userPrompt = `[Context: ${JSON.stringify(ctx)}]\n\nUser: ${msg}`;

    let systemPrompt = RICO_SYSTEM;
    if (persona && PERSONA_PROMPTS[persona]) {
      systemPrompt += PERSONA_PROMPTS[persona];
    }
    systemPrompt += getHolidayContext();

    const reply = await invokeNova(systemPrompt, userPrompt, { temperature: 0.8, maxTokens: 256 });
    logInfo("Rico chat reply", { route: "rico", persona: persona || "default" });
    return NextResponse.json({ reply: reply.trim() });
  } catch (err) {
    logError("Rico chat failed", err, { route: "rico" });
    return NextResponse.json({ error: "Reco is taking a breather. Try again." }, { status: 500 });
  }
}
