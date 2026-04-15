import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { invokeNova } from "@/lib/nova";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { logError } from "@/lib/logger";

const SYSTEM = `You are The Ref, a proactive AI fitness coach. Generate a contextual check-in message based on the user's current progress.

If they're doing well: celebrate and push them to maintain
If they're slipping: be direct but caring — call out the pattern
If they haven't logged: ask what's going on, don't assume

Keep it to 2-3 sentences. Be conversational, not robotic. Use their name.
Return JSON: { "message": string, "tone": "encouraging"|"neutral"|"confrontational" }`;

export async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "coach-checkin"), 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const userId = await getUserId(req.headers);
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    const { name, todayMeals, todayTargets, workoutCompleted, streak, biofeedback } = await req.json();

    const prompt = `User: ${name ?? "friend"}
Meals logged today: ${todayMeals ?? 0}
Daily targets: ${JSON.stringify(todayTargets ?? {})}
Workout completed today: ${workoutCompleted ?? false}
Current streak: ${streak ?? 0} days
Latest biofeedback: ${JSON.stringify(biofeedback ?? {})}

Generate a check-in message.`;

    const raw = await invokeNova(SYSTEM, prompt, { temperature: 0.8, maxTokens: 256 });
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ message: "Hey! How's your day going? Don't forget to log your meals.", tone: "neutral" });
    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json(parsed);
  } catch (err) {
    logError("Coach check-in failed", err, { route: "coach/check-in" });
    return NextResponse.json({ message: "Keep pushing! Log your meals when you can.", tone: "encouraging" });
  }
}
