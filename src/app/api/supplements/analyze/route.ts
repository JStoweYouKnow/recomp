import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { invokeNova } from "@/lib/nova";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { logError } from "@/lib/logger";

const SYSTEM = `You are a nutrition and supplement analysis AI. Given the user's current supplements, blood work results (if available), and dietary patterns, identify potential deficiencies and suggest improvements.

Important: You are NOT a doctor. Frame all recommendations as suggestions to discuss with a healthcare provider.

Return JSON: {
  "deficiencies": [{ "nutrient": string, "severity": "possible"|"likely"|"confirmed", "evidence": string }],
  "recommendations": [{ "action": string, "priority": "high"|"medium"|"low", "reason": string }],
  "interactions": [string] (any potential supplement interactions to be aware of)
}`;

export async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "supplements-analyze"), 5, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const userId = await getUserId(req.headers);
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    const { supplements, bloodWork, dietSummary, goal } = await req.json();

    const prompt = `Current supplements: ${JSON.stringify(supplements ?? [])}
Blood work results: ${JSON.stringify(bloodWork ?? "none available")}
Diet summary: ${JSON.stringify(dietSummary ?? "not provided")}
Fitness goal: ${goal ?? "general health"}

Analyze for potential deficiencies and provide recommendations.`;

    const raw = await invokeNova(SYSTEM, prompt, { temperature: 0.3, maxTokens: 1024 });
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ deficiencies: [], recommendations: [], interactions: [] });
    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json(parsed);
  } catch (err) {
    logError("Supplement analysis failed", err, { route: "supplements/analyze" });
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}
