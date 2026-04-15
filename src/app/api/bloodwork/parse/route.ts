import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { invokeNovaWithImage } from "@/lib/nova";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { logError } from "@/lib/logger";

const SYSTEM = `You are a lab results extraction AI. Given an image of blood work / lab results, extract all measurable markers.

Return JSON: {
  "markers": [{
    "name": string (standardized name, e.g. "Vitamin D", "Hemoglobin", "TSH"),
    "value": number,
    "unit": string,
    "normalRange": { "low": number, "high": number },
    "status": "low"|"normal"|"high"
  }]
}

Extract as many markers as you can read clearly. Use standard medical abbreviations and units. Mark status based on whether value falls within the normal range provided on the report.`;

export async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "bloodwork-parse"), 5, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const userId = await getUserId(req.headers);
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    const formData = await req.formData();
    const imageFile = formData.get("image") as File | null;
    if (!imageFile) return NextResponse.json({ error: "Image required" }, { status: 400 });

    const bytes = await imageFile.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");

    const raw = await invokeNovaWithImage(SYSTEM, "Extract all lab markers from this blood work report.", base64, "jpeg");
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ markers: [] });
    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json(parsed);
  } catch (err) {
    logError("Blood work parse failed", err, { route: "bloodwork/parse" });
    return NextResponse.json({ error: "Failed to parse blood work" }, { status: 500 });
  }
}
