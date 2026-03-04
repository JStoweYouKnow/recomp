import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { invokeNovaWithImage } from "@/lib/nova";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { logError } from "@/lib/logger";

const SYSTEM = `You are a body composition analysis AI. Given a body photo (front, side, or back), provide:
1. A brief assessment of visible muscle development and body composition
2. An estimated body fat percentage range (e.g. "15-18%")
3. Areas of notable muscle development
4. Suggested focus areas for improvement

Be encouraging but honest. This is for fitness tracking, not medical advice.

Return JSON: {
  "analysis": string (2-3 sentences),
  "bodyFatEstimate": number (midpoint of range),
  "muscleAssessment": string (1-2 sentences about muscle development)
}`;

export async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "body-scan"), 5, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const userId = await getUserId(req.headers);
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    const formData = await req.formData();
    const imageFile = formData.get("image") as File | null;
    if (!imageFile) return NextResponse.json({ error: "Image required" }, { status: 400 });

    const bytes = await imageFile.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");

    const raw = await invokeNovaWithImage(SYSTEM, "Analyze this body photo for fitness progress tracking.", base64, "jpeg");
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({
        analysis: raw.slice(0, 500),
        bodyFatEstimate: null,
        muscleAssessment: null,
      });
    }
    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json(parsed);
  } catch (err) {
    logError("Body scan analysis failed", err, { route: "body-scan/analyze" });
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}
