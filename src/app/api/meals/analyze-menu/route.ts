import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { invokeNovaWithImage } from "@/lib/nova";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { logError } from "@/lib/logger";
import { resolveMealLogDate } from "@/lib/date-utils";
import { normalizeMenuItems, rankMenuItems } from "@/lib/menu-fit";
import { resolveMenuBudget } from "@/lib/services/menu-picks";

const SYSTEM = `You are a restaurant menu analysis AI. Given a photo or screenshot of a restaurant menu (including delivery apps like Uber Eats, DoorDash, or Grubhub), extract all readable menu items and estimate their macros.

Return ONLY a JSON object:
{
  "restaurantName": string or null,
  "items": [{
    "name": string,
    "description": string or null,
    "estimatedMacros": { "calories": number, "protein": number, "carbs": number, "fat": number },
    "confidence": "high"|"medium"|"low"
  }]
}

If calories are printed next to an item (delivery apps often show "690 Cal"), use that number exactly and estimate the remaining macros to match it.
Base other estimates on typical restaurant portion sizes. Mark confidence as "high" for well-known dishes or printed calories, "medium" for standard items, "low" for unusual items.
Skip drinks, sauces, and add-ons unless they are the only items shown.`;

function parseJsonField(value: FormDataEntryValue | null): unknown {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

/** Menu photo/screenshot → items with estimated macros, ranked against today's remaining budget. */
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
    const objMatch = raw.match(/\{[\s\S]*\}/);
    const arrMatch = raw.match(/\[[\s\S]*\]/);
    let parsed: { restaurantName?: unknown; items?: unknown } = {};
    try {
      if (objMatch && (!arrMatch || objMatch.index! < arrMatch.index!)) parsed = JSON.parse(objMatch[0]);
      else if (arrMatch) parsed = { items: JSON.parse(arrMatch[0]) };
    } catch {
      /* fall through with no items */
    }
    const items = normalizeMenuItems(parsed.items);
    const restaurantName =
      typeof parsed.restaurantName === "string" && parsed.restaurantName.trim() ? parsed.restaurantName.trim() : null;
    if (!items.length) return NextResponse.json({ items: [], restaurantName });

    const date = resolveMealLogDate({
      clientDate: formData.get("date"),
      timezoneOffsetMinutes: formData.get("timezoneOffsetMinutes"),
    });
    const { budget, goal } = await resolveMenuBudget(userId, {
      remainingMacros: parseJsonField(formData.get("remainingMacros")),
      goal: formData.get("goal"),
      date,
    });

    return NextResponse.json({
      items: rankMenuItems(items, budget, { goal }),
      restaurantName,
      remainingMacros: budget,
    });
  } catch (err) {
    logError("Menu analysis failed", err, { route: "meals/analyze-menu" });
    return NextResponse.json({ error: "Menu analysis failed" }, { status: 500 });
  }
}
