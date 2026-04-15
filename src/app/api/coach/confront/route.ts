import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { invokeNova } from "@/lib/nova";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { logError } from "@/lib/logger";

const SYSTEM = `You are The Ref, an AI fitness coach doing a pattern confrontation. The user has a negative pattern that needs addressing.

Be direct but caring. Don't sugarcoat. Name the specific pattern. Offer one concrete action they can take right now.

Examples:
- "Alex, you've skipped leg day 3 weeks in a row. I know it's not the glamour muscles, but your body needs balance. Today: just one set of squats. That's it. Start there."
- "You haven't logged a meal in 4 days. What's going on? If life got busy, that's okay — but let's get back on track with one meal today."

Return JSON: { "pattern": string, "message": string, "actionItem": string }`;

export async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "coach-confront"), 5, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const userId = await getUserId(req.headers);
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    const { name, patterns } = await req.json();

    const prompt = `User: ${name ?? "friend"}
Detected patterns (last 7-14 days): ${JSON.stringify(patterns ?? [])}

Generate a confrontation message about the most concerning pattern.`;

    const raw = await invokeNova(SYSTEM, prompt, { temperature: 0.7, maxTokens: 512 });
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ pattern: "unknown", message: "Let's check in on your progress.", actionItem: "Log one meal today." });
    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json(parsed);
  } catch (err) {
    logError("Coach confront failed", err, { route: "coach/confront" });
    return NextResponse.json({ error: "Confrontation generation failed" }, { status: 500 });
  }
}
