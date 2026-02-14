import { NextRequest, NextResponse } from "next/server";
import { invokeNova } from "@/lib/nova";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";

const SYSTEM = `You are a nutrition logging assistant. Parse the user's spoken meal description into structured data.
Respond with valid JSON only, no markdown:
{"name": "meal name", "calories": number, "protein": number, "carbs": number, "fat": number}
If details are unclear, make reasonable estimates.`;

export async function POST(req: NextRequest) {
  const rl = fixedWindowRateLimit(getClientKey(getRequestIp(req), "voice-parse"), 15, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  try {
    const { transcript } = await req.json();
    if (!transcript || typeof transcript !== "string") {
      return NextResponse.json({ error: "Transcript required" }, { status: 400 });
    }

    const raw = await invokeNova(SYSTEM, `Parse this meal: "${transcript}"`, { temperature: 0.3, maxTokens: 256 });
    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : null;
    return NextResponse.json(parsed || { name: transcript, calories: 0, protein: 0, carbs: 0, fat: 0 });
  } catch (err) {
    console.error("Voice parse error:", err);
    return NextResponse.json({ error: "Parse failed" }, { status: 500 });
  }
}
