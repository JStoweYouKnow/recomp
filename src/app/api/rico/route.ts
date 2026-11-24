import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { requireAuthForAI } from "@/lib/judgeMode";
import { logInfo, logError, withRequestLogging } from "@/lib/logger";
import { enrichPersistedLogMeals } from "@/lib/meal-macro-grounding";
import {
  invokeRico,
  invokeRicoStream,
  persistHeadlessRicoActions,
  replyClaimsMealLogged,
} from "@/lib/services/rico";
import { stripRicoDiagnosticMarkup } from "@/lib/rico-reply-sanitizer";
import { dbGetMeals, dbGetSavedRecipes, dbSaveSavedRecipes } from "@/lib/db";
import { resolveMealLogDate } from "@/lib/date-utils";
import { rankWithDiscovery } from "@/lib/recipe-library";
import { remainingMacros } from "@/lib/recipe-fit";
import type { CookingAppRecipe } from "@/lib/types";
import { resolveRestaurantPicksAction, restaurantPicksHeadline } from "@/lib/services/menu-picks";

export const maxDuration = 60;

type RicoBody = {
  message?: string;
  history?: unknown;
  context?: Record<string, unknown>;
  persona?: string;
  stream?: boolean;
};

async function finalizeRicoSideEffects(
  userId: string | null,
  actions: { type: string; payload: Record<string, unknown> }[],
  replyText: string,
  context: Record<string, unknown>,
  defaultDate: string,
) {
  let nextReply = replyText;
  let recipeSuggestions: Awaited<ReturnType<typeof rankWithDiscovery>> | undefined;
  let recipeSaved: CookingAppRecipe | undefined;

  if (userId && actions.length > 0) {
    const { replySuffix } = await persistHeadlessRicoActions(userId, actions, { defaultDate });
    nextReply += replySuffix;
    if (actions.some((a) => a.type === "log_meal")) {
      void enrichPersistedLogMeals(userId, actions).catch(() => {});
    }
  } else if (actions.length > 0 && !userId) {
    logError("Rico returned actions but user is not authenticated — meals will not persist server-side", undefined, {
      route: "rico",
      actionTypes: actions.map((a) => a.type),
    });
  }

  if (userId && actions.some((a) => a.type === "log_meal")) {
    const meals = await dbGetMeals(userId);
    const today = defaultDate;
    const protein = Math.round(
      meals.filter((m) => m.date.slice(0, 10) === today).reduce((sum, m) => sum + m.macros.protein, 0),
    );
    if (replyClaimsMealLogged(nextReply) && !nextReply.includes(`${protein}g protein`)) {
      nextReply = nextReply.replace(
        /\bYou're at \d+g protein today\b[^.!]*[.!]?/gi,
        `You're at ${protein}g protein today`,
      );
      if (!/\b\d+g protein today\b/i.test(nextReply)) {
        nextReply += ` You're at ${protein}g protein today.`;
      }
    }
  }

  const restaurantResult = await resolveRestaurantPicksAction(userId, actions, {
    date: defaultDate,
    remainingMacros:
      context.remainingMacros ??
      (context.macroTargets && context.todayMacros
        ? remainingMacros(
            context.macroTargets as Parameters<typeof remainingMacros>[0],
            context.todayMacros as Parameters<typeof remainingMacros>[1],
          )
        : undefined),
    goal: context.goal,
  });
  if (restaurantResult) nextReply = restaurantPicksHeadline(restaurantResult);

  if (userId && actions.length > 0) {
    for (const action of actions) {
      if (action.type === "suggest_recipes") {
        const payload = action.payload as {
          mealType?: string;
          query?: string;
          includeDiscover?: boolean;
        };
        const ctx = context as {
          macroTargets?: { calories: number; protein: number; carbs: number; fat: number };
          todayMacros?: { calories: number; protein: number; carbs: number; fat: number };
          remainingMacros?: { calories: number; protein: number; carbs: number; fat: number };
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
          // Recipe URL parse is handled by the client fetch in non-stream mode; skip here if no origin.
        }
      }
    }
  }

  return {
    replyText: nextReply,
    recipeSuggestions,
    recipeSaved,
    restaurantResult,
  };
}

export const POST = withRequestLogging("/api/rico", async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "rico"), 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  if (requireAuthForAI()) {
    const userId = await getUserId(req.headers);
    if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as RicoBody;
    const msg = typeof body.message === "string" ? body.message.trim() : "";
    if (!msg) return NextResponse.json({ error: "Message required" }, { status: 400 });

    const context = (body.context ?? {}) as Record<string, unknown>;
    const persona = typeof body.persona === "string" ? body.persona : undefined;
    const history = Array.isArray(body.history) ? body.history : undefined;
    const userId = await getUserId(req.headers);
    const defaultDate = resolveMealLogDate({
      clientDate: context.today ?? context.clientDate,
      timezoneOffsetMinutes: context.timezoneOffsetMinutes,
    });

    if (body.stream === true) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const send = (obj: unknown) => {
            controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
          };
          try {
            let actions: { type: string; payload: Record<string, unknown> }[] = [];
            let reply = "";
            for await (const event of invokeRicoStream({
              message: msg,
              history: history as Parameters<typeof invokeRicoStream>[0]["history"],
              context,
              persona,
            })) {
              if (event.type === "text") {
                send({ type: "text", content: event.content });
              } else if (event.type === "done") {
                actions = event.actions;
                reply = event.reply;
              }
            }

            const finalized = await finalizeRicoSideEffects(userId, actions, reply, context, defaultDate);
            let replyText = stripRicoDiagnosticMarkup(finalized.replyText);

            // Recipe URL save still needs the request origin (stream path).
            if (userId) {
              for (const action of actions) {
                if (action.type !== "save_recipe_from_url") continue;
                const url = (action.payload as { url?: string }).url;
                if (!url || typeof url !== "string") continue;
                const parseRes = await fetch(`${req.nextUrl.origin}/api/meals/parse-recipe-url`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    cookie: req.headers.get("cookie") ?? "",
                  },
                  body: JSON.stringify({ url }),
                });
                if (!parseRes.ok) continue;
                const parsed = await parseRes.json();
                const recipeSaved: CookingAppRecipe = {
                  id: `url_${Date.now()}`,
                  name: parsed.name ?? "Recipe",
                  calories: Math.round(parsed.macros?.calories ?? 0),
                  protein: Math.round(parsed.macros?.protein ?? 0),
                  carbs: Math.round(parsed.macros?.carbs ?? 0),
                  fat: Math.round(parsed.macros?.fat ?? 0),
                  recipeUrl: url.trim(),
                  source: "url",
                  servings: parsed.servings ?? 1,
                  addedAt: new Date().toISOString(),
                };
                const existing = await dbGetSavedRecipes(userId);
                const next = [
                  recipeSaved,
                  ...existing.filter(
                    (r) => (r.recipeUrl ?? "").toLowerCase() !== recipeSaved.recipeUrl!.toLowerCase(),
                  ),
                ].slice(0, 500);
                await dbSaveSavedRecipes(userId, next);
                send({ type: "recipeSaved", recipeSaved });
              }
            }

            if (finalized.recipeSuggestions?.length) {
              send({ type: "recipeSuggestions", recipeSuggestions: finalized.recipeSuggestions });
            }

            send({
              type: "done",
              reply: replyText,
              actions,
              restaurantPicks: finalized.restaurantResult?.picks ?? undefined,
            });
            logInfo("Rico chat reply (stream)", { route: "rico", persona: persona || "default", actions: actions.length });
          } catch (err) {
            logError("Rico stream failed", err, { route: "rico" });
            send({ type: "error", error: "The Ref is taking a breather. Try again." });
          } finally {
            controller.close();
          }
        },
      });

      return new NextResponse(stream, {
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
        },
      });
    }

    const { reply, actions } = await invokeRico({
      message: msg,
      history: history as Parameters<typeof invokeRico>[0]["history"],
      context,
      persona,
    });

    const finalized = await finalizeRicoSideEffects(userId, actions, reply, context, defaultDate);
    let replyText = finalized.replyText;
    let recipeSaved: CookingAppRecipe | undefined = finalized.recipeSaved;

    if (userId && actions.length > 0) {
      for (const action of actions) {
        if (action.type === "save_recipe_from_url") {
          const url = (action.payload as { url?: string }).url;
          if (url && typeof url === "string") {
            const parseRes = await fetch(`${req.nextUrl.origin}/api/meals/parse-recipe-url`, {
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
                  (r) => (r.recipeUrl ?? "").toLowerCase() !== recipeSaved!.recipeUrl!.toLowerCase(),
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
      reply: stripRicoDiagnosticMarkup(replyText),
      actions,
      recipeSuggestions: finalized.recipeSuggestions,
      recipeSaved,
      restaurantPicks: finalized.restaurantResult?.picks ?? undefined,
    });
  } catch (err) {
    logError("Rico chat failed", err, { route: "rico" });
    return NextResponse.json({ error: "The Ref is taking a breather. Try again." }, { status: 500 });
  }
});
