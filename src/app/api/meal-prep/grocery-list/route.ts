import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { logError } from "@/lib/logger";

export async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "grocery-list"), 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const userId = await getUserId(req.headers);
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    const { recipes, pantryItems } = await req.json();
    if (!recipes || !Array.isArray(recipes)) {
      return NextResponse.json({ error: "Recipes required" }, { status: 400 });
    }

    // Consolidate ingredients across all recipes
    const ingredientMap = new Map<string, { amount: string; category: string }>();
    for (const recipe of recipes) {
      for (const ing of recipe.ingredients ?? []) {
        const key = ing.name.toLowerCase().trim();
        if (ingredientMap.has(key)) {
          const existing = ingredientMap.get(key)!;
          existing.amount += ` + ${ing.amount}`;
        } else {
          ingredientMap.set(key, { amount: ing.amount, category: ing.category ?? "other" });
        }
      }
    }

    // Remove items already in pantry
    const pantryNames = new Set((pantryItems ?? []).map((p: { name: string }) => p.name.toLowerCase().trim()));
    const groceryList = Array.from(ingredientMap.entries())
      .filter(([name]) => !pantryNames.has(name))
      .map(([item, { amount, category }]) => ({ item, amount, category, checked: false }))
      .sort((a, b) => a.category.localeCompare(b.category));

    return NextResponse.json({ groceryList });
  } catch (err) {
    logError("Grocery list failed", err, { route: "meal-prep/grocery-list" });
    return NextResponse.json({ error: "Failed to generate grocery list" }, { status: 500 });
  }
}
