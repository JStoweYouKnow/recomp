import { NextRequest, NextResponse } from "next/server";
import { invokeNovaWithImage } from "@/lib/nova";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";

const SYSTEM = `You are a grocery receipt analyzer. Extract food items from the receipt image and estimate their nutritional value.

For each item:
1. Identify the food name (skip non-food items like bags, tax, etc.)
2. Estimate reasonable macro values per typical serving

Respond with valid JSON only, no markdown:
{"items": [{"name": "food name", "quantity": "1 lb / 1 pack / etc", "calories": number, "protein": number, "carbs": number, "fat": number}]}

If a line item is ambiguous, make your best guess. Skip non-food items entirely.`;

export async function POST(req: NextRequest) {
  const rl = fixedWindowRateLimit(getClientKey(getRequestIp(req), "analyze-receipt"), 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  try {
    const formData = await req.formData();
    const image = formData.get("image") as File | null;
    if (!image) {
      return NextResponse.json({ error: "Image required" }, { status: 400 });
    }

    const bytes = await image.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const ext = image.type.includes("png") ? "png" : "jpeg";

    const raw = await invokeNovaWithImage(
      SYSTEM,
      "Analyze this grocery receipt. Extract all food items with estimated nutrition per serving. Return JSON only.",
      base64,
      ext as "png" | "jpeg"
    );

    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : { items: [] };

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("Receipt analysis error:", err);
    return NextResponse.json({ error: "Receipt analysis failed" }, { status: 500 });
  }
}
