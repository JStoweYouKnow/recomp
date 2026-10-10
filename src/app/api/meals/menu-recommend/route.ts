import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { logError } from "@/lib/logger";
import { resolveMealLogDate } from "@/lib/date-utils";
import { normalizeMenuItems, rankMenuItems } from "@/lib/menu-fit";
import { resolveMenuBudget } from "@/lib/services/menu-picks";

/** Rank already-extracted menu items against the remaining macro budget (no image needed). */
export async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "menu-recommend"), 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const userId = await getUserId(req.headers);
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    const { menuItems, remainingMacros, goal, date, timezoneOffsetMinutes } = await req.json();
    if (!menuItems || !Array.isArray(menuItems)) {
      return NextResponse.json({ error: "Menu items required" }, { status: 400 });
    }
    const budgetInfo = await resolveMenuBudget(userId, {
      remainingMacros,
      goal,
      date: resolveMealLogDate({ clientDate: date, timezoneOffsetMinutes }),
    });
    const recommendations = rankMenuItems(normalizeMenuItems(menuItems), budgetInfo.budget, { goal: budgetInfo.goal });
    return NextResponse.json({ recommendations, remainingMacros: budgetInfo.budget });
  } catch (err) {
    logError("Menu recommend failed", err, { route: "meals/menu-recommend" });
    return NextResponse.json({ error: "Recommendation failed" }, { status: 500 });
  }
}
