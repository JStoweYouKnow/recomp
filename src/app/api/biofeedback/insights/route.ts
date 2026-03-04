import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { invokeNova } from "@/lib/nova";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { logError } from "@/lib/logger";

const SYSTEM = `You are a biofeedback analysis AI. Analyze the user's subjective biofeedback data (energy, mood, hunger, stress, soreness on 1-5 scales) alongside their nutrition, training, and sleep data.

Find meaningful correlations like:
- "You tend to feel low energy on days after eating less than 150g carbs"
- "Your best mood scores happen after 7+ hours of sleep"
- "Soreness peaks 2 days after heavy training sessions"

Return JSON: {
  "correlations": [{ "factor": string, "observation": string, "strength": "strong"|"moderate"|"weak" }],
  "recommendations": [string, string, ...]
}

Be specific and data-driven. Reference actual numbers from the data.`;

export async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "biofeedback-insights"), 5, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const userId = await getUserId(req.headers);
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    const { biofeedback, meals, wearableData } = await req.json();
    const prompt = `Biofeedback entries (last 14 days): ${JSON.stringify(biofeedback ?? [])}
Meals (last 14 days): ${JSON.stringify((meals ?? []).map((m: { date: string; name: string; macros: unknown }) => ({ date: m.date, name: m.name, macros: m.macros })))}
Wearable data (last 14 days): ${JSON.stringify(wearableData ?? [])}

Analyze correlations between subjective feelings and objective data.`;

    const raw = await invokeNova(SYSTEM, prompt, { temperature: 0.4, maxTokens: 1024 });
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ correlations: [], recommendations: ["Keep logging to build more data."] });
    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json(parsed);
  } catch (err) {
    logError("Biofeedback insights failed", err, { route: "biofeedback/insights" });
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}
