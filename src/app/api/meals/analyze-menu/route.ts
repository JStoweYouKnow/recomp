import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { invokeNovaWithImage } from "@/lib/nova";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { logError } from "@/lib/logger";

const SYSTEM = `You are a restaurant menu analysis AI. Given a photo of a restaurant menu, extract all readable menu items and estimate their macros.

Return JSON array: [{
  "name": string,
  "description": string or null,
  "estimatedMacros": { "calories": number, "protein": number, "carbs": number, "fat": number },
  "confidence": "high"|"medium"|"low"
}]

Base estimates on typical restaurant portion sizes. Mark confidence as "high" for well-known dishes, "medium" for standard items, "low" for unusual items.`;

export async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "analyze-menu"), 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const userId = await getUserId(req.headers);
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    const formData = await req.formData();
    const imageFile = formData.get("image") as File | null;
    if (!imageFile) return NextResponse.json({ error: "Image required" }, { status: 400 });

    const bytes = await imageFile.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");

    const raw = await invokeNovaWithImage(SYSTEM, "Extract all menu items with estimated macros.", base64, "jpeg");
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return NextResponse.json({ items: [] });
    const items = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ items });
  } catch (err) {
    logError("Menu analysis failed", err, { route: "meals/analyze-menu" });
    return NextResponse.json({ error: "Menu analysis failed" }, { status: 500 });
  }
}
