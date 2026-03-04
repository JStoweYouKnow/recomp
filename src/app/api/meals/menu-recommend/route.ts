import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { invokeNova } from "@/lib/nova";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { logError } from "@/lib/logger";

const SYSTEM = `You are a restaurant menu advisor. Given menu items with estimated macros and the user's remaining daily macro budget, recommend the best options.

Rank items by how well they fit the remaining budget. Prioritize protein-dense options for fitness goals.

Return JSON array: [{
  "name": string,
  "estimatedMacros": { "calories": number, "protein": number, "carbs": number, "fat": number },
  "recommended": true|false,
  "reasonForRecommendation": string
}]

Mark the top 1-3 items as recommended with clear reasoning.`;

export async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "menu-recommend"), 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const userId = await getUserId(req.headers);
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    const { menuItems, remainingMacros, goal } = await req.json();
    if (!menuItems || !Array.isArray(menuItems)) {
      return NextResponse.json({ error: "Menu items required" }, { status: 400 });
    }

    const prompt = `Menu items: ${JSON.stringify(menuItems)}
Remaining daily budget: ${JSON.stringify(remainingMacros)}
Fitness goal: ${goal ?? "maintain"}

Recommend the best options.`;

    const raw = await invokeNova(SYSTEM, prompt, { temperature: 0.3, maxTokens: 1024 });
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return NextResponse.json({ recommendations: menuItems });
    const recommendations = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ recommendations });
  } catch (err) {
    logError("Menu recommend failed", err, { route: "meals/menu-recommend" });
    return NextResponse.json({ error: "Recommendation failed" }, { status: 500 });
  }
}
