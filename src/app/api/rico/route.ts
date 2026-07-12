import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { requireAuthForAI } from "@/lib/judgeMode";
import { logInfo, logError, withRequestLogging } from "@/lib/logger";
import { invokeRico } from "@/lib/services/rico";
import { dbGetSavedRecipes, dbSaveSavedRecipes } from "@/lib/db";
import { rankWithDiscovery } from "@/lib/recipe-library";
import { remainingMacros } from "@/lib/recipe-fit";
import type { CookingAppRecipe } from "@/lib/types";

export const POST = withRequestLogging("/api/rico", async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "rico"), 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  if (requireAuthForAI()) {
    const userId = await getUserId(req.headers);
    if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    const { message, history, context, persona } = await req.json();
    const msg = typeof message === "string" ? message.trim() : "";
    if (!msg) return NextResponse.json({ error: "Message required" }, { status: 400 });

    const { reply, actions } = await invokeRico({
      message: msg,
      history: Array.isArray(history) ? history : undefined,
      context: context ?? undefined,
      persona: typeof persona === "string" ? persona : undefined,
    });

    let recipeSuggestions: Awaited<ReturnType<typeof rankWithDiscovery>> | undefined;
    let recipeSaved: CookingAppRecipe | undefined;

    const userId = await getUserId(req.headers);
    if (userId && actions.length > 0) {
      for (const action of actions) {
        if (action.type === "suggest_recipes") {
          const payload = action.payload as {
            mealType?: string;
            query?: string;
            includeDiscover?: boolean;
          };
          const ctx = (context ?? {}) as {
            macroTargets?: { calories: number; protein: number; carbs: number; fat: number };
            todayMacros?: { calories: number; protein: number; carbs: number; fat: number };
            goal?: string;
            savedRecipes?: CookingAppRecipe[];
          };
          const targets = ctx.macroTargets ?? { calories: 2000, protein: 150, carbs: 200, fat: 65 };
          const consumed = ctx.todayMacros ?? { calories: 0, protein: 0, carbs: 0, fat: 0 };
          const budget = ctx.remainingMacros ?? remainingMacros(targets, consumed);
          const saved = ctx.savedRecipes?.length
            ? ctx.savedRecipes
            : await dbGetSavedRecipes(userId).catch(() => []);

          recipeSuggestions = await rankWithDiscovery(saved, budget, {
            goal: ctx.goal,
            mealType: payload.mealType,
            query: payload.query,
            includeDiscover: payload.includeDiscover !== false,
            limit: 5,
          });
        }

        if (action.type === "save_recipe_from_url") {
          const url = (action.payload as { url?: string }).url;
          if (url && typeof url === "string") {
            const origin = req.nextUrl.origin;
            const parseRes = await fetch(`${origin}/api/meals/parse-recipe-url`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                cookie: req.headers.get("cookie") ?? "",
              },
              body: JSON.stringify({ url }),
            });
            if (parseRes.ok) {
              const parsed = await parseRes.json();
              const now = new Date().toISOString();
              recipeSaved = {
                id: `url_${Date.now()}`,
                name: parsed.name ?? "Recipe",
                calories: Math.round(parsed.macros?.calories ?? 0),
                protein: Math.round(parsed.macros?.protein ?? 0),
                carbs: Math.round(parsed.macros?.carbs ?? 0),
                fat: Math.round(parsed.macros?.fat ?? 0),
                recipeUrl: url.trim(),
                source: "url",
                servings: parsed.servings ?? 1,
                addedAt: now,
              };
              const existing = await dbGetSavedRecipes(userId);
              const next = [
                recipeSaved,
                ...existing.filter(
                  (r) => (r.recipeUrl ?? "").toLowerCase() !== recipeSaved!.recipeUrl!.toLowerCase()
                ),
              ].slice(0, 500);
              await dbSaveSavedRecipes(userId, next);
            }
          }
        }
      }
    }

    logInfo("Rico chat reply", { route: "rico", persona: persona || "default", actions: actions.length });
    return NextResponse.json({
      reply,
      actions,
      recipeSuggestions,
      recipeSaved,
    });
  } catch (err) {
    logError("Rico chat failed", err, { route: "rico" });
    return NextResponse.json({ error: "The Ref is taking a breather. Try again." }, { status: 500 });
  }
});
