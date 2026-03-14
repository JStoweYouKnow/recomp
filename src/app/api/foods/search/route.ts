import { NextRequest, NextResponse } from "next/server";
import {
  fixedWindowRateLimit,
  getClientKey,
  getRateLimitHeaderValues,
  getRequestIp,
} from "@/lib/server-rate-limit";
import { withRequestLogging } from "@/lib/logger";
import { dbSearchCommunityFoods, dbGetPopularFoods } from "@/lib/db";
import { lookupCommonFood, COMMON_FOODS } from "@/lib/food-quantity-parser";

export const GET = withRequestLogging("/api/foods/search", async function GET(req: NextRequest) {
  try {
    const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "foods-search"), 60, 60_000);
    if (!rl.ok) {
      const headers = getRateLimitHeaderValues(rl);
      const res = NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
      res.headers.set("X-RateLimit-Limit", headers.limit);
      res.headers.set("X-RateLimit-Remaining", headers.remaining);
      res.headers.set("X-RateLimit-Reset", headers.reset);
      return res;
    }

    const query = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10) || 20, 50);

    // If no query, return popular foods
    if (!query) {
      const popular = await dbGetPopularFoods(limit);
      // Merge with common foods for a richer default list
      const commonEntries = Object.entries(COMMON_FOODS).slice(0, Math.max(0, limit - popular.length)).map(([name, data]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        normalizedName: name,
        calories: data.calories,
        protein: data.protein,
        carbs: data.carbs,
        fat: data.fat,
        servingNote: data.servingNote,
        source: "common-foods" as const,
        logCount: 0,
      }));
      return NextResponse.json({ results: [...popular, ...commonEntries].slice(0, limit) });
    }

    // Search local common foods first (instant, zero-cost)
    const lowerQuery = query.toLowerCase();
    const commonMatches = Object.entries(COMMON_FOODS)
      .filter(([key]) => key.includes(lowerQuery) || lowerQuery.includes(key))
      .slice(0, 5)
      .map(([name, data]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        normalizedName: name,
        calories: data.calories,
        protein: data.protein,
        carbs: data.carbs,
        fat: data.fat,
        servingNote: data.servingNote,
        source: "common-foods" as const,
        logCount: 1000, // Rank common foods highly
      }));

    // Search community foods from DynamoDB
    const communityMatches = await dbSearchCommunityFoods(query, limit);

    // Merge and deduplicate by normalizedName, preferring higher logCount
    const seen = new Set<string>();
    const merged = [...commonMatches, ...communityMatches]
      .sort((a, b) => b.logCount - a.logCount)
      .filter((item) => {
        const key = item.normalizedName;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, limit);

    return NextResponse.json({ results: merged });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Search failed" },
      { status: 500 }
    );
  }
});
