import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { z } from "zod";
import crypto from "crypto";
import {
  fixedWindowRateLimit,
  getClientKey,
  getRateLimitHeaderValues,
  getRequestIp,
} from "@/lib/server-rate-limit";

/**
 * Cooking App Webhook Receiver
 *
 * Accepts inbound meal data from cooking / nutrition apps.
 * Supports Whisk, Yummly, Mealime, Paprika, Cronometer, MyFitnessPal, LoseIt, or any custom app.
 *
 * Authentication: The request must carry either:
 *   1. A valid recomp_uid cookie (same-origin integrations), OR
 *   2. An `x-webhook-signature` HMAC-SHA256 signature (server-to-server webhooks)
 */

const PROVIDERS = [
  "whisk",
  "mealime",
  "yummly",
  "paprika",
  "cronometer",
  "myfitnesspal",
  "loseit",
  "custom",
] as const;

const mealPayloadSchema = z.object({
  provider: z.enum(PROVIDERS),
  externalId: z.string().optional(),
  name: z.string().min(1).max(500),
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]).optional(),
  date: z.string().optional(),
  servings: z.number().positive().optional(),
  macros: z.object({
    calories: z.number().min(0).optional(),
    protein: z.number().min(0).optional(),
    carbs: z.number().min(0).optional(),
    fat: z.number().min(0).optional(),
    fiber: z.number().min(0).optional(),
    sugar: z.number().min(0).optional(),
    sodium: z.number().min(0).optional(),
  }),
  ingredients: z
    .array(
      z.object({
        name: z.string(),
        amount: z.string().optional(),
        calories: z.number().optional(),
      })
    )
    .optional(),
  recipeUrl: z.string().url().optional(),
  notes: z.string().max(2000).optional(),
});

const webhookBodySchema = z.object({
  meals: z.array(mealPayloadSchema).min(1).max(50),
});

function verifySignature(
  body: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");
  const sigBuf = Buffer.from(signature, "hex");
  const expBuf = Buffer.from(expected, "hex");
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

export async function POST(req: NextRequest) {
  try {
    // Rate limit
    const rl = fixedWindowRateLimit(
      getClientKey(getRequestIp(req), "cooking-webhook"),
      30,
      60_000
    );
    if (!rl.ok) {
      const headers = getRateLimitHeaderValues(rl);
      const res = NextResponse.json(
        { error: "Rate limit exceeded. Try again shortly." },
        { status: 429 }
      );
      res.headers.set("X-RateLimit-Limit", headers.limit);
      res.headers.set("X-RateLimit-Remaining", headers.remaining);
      res.headers.set("X-RateLimit-Reset", headers.reset);
      res.headers.set("Retry-After", headers.retryAfter);
      return res;
    }

    // Auth check – cookie or webhook secret
    const userId = await getUserId();
    const webhookSig = req.headers.get("x-webhook-signature");
    const webhookSecret = process.env.COOKING_WEBHOOK_SECRET;

    if (!userId) {
      // Server-to-server: verify HMAC
      if (!webhookSecret) {
        return NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        );
      }
      const rawBody = await req.clone().text();
      if (!verifySignature(rawBody, webhookSig, webhookSecret)) {
        return NextResponse.json(
          { error: "Invalid webhook signature" },
          { status: 403 }
        );
      }
    }

    const body = await req.json();
    const parsed = webhookBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    // Transform each inbound meal into our MealEntry format
    const mealEntries = parsed.data.meals.map((m, i) => {
      const servings = m.servings ?? 1;
      return {
        id: `cook_${Date.now()}_${i}`,
        date: m.date ?? today,
        mealType: m.mealType ?? guessMealType(),
        name: m.name,
        macros: {
          calories: Math.round((m.macros.calories ?? 0) * servings),
          protein: Math.round((m.macros.protein ?? 0) * servings),
          carbs: Math.round((m.macros.carbs ?? 0) * servings),
          fat: Math.round((m.macros.fat ?? 0) * servings),
        },
        notes: [
          m.provider !== "custom" ? `via ${m.provider}` : "",
          m.recipeUrl ? `Recipe: ${m.recipeUrl}` : "",
          m.notes ?? "",
          m.macros.fiber != null ? `Fiber: ${Math.round(m.macros.fiber * servings)}g` : "",
          m.macros.sugar != null ? `Sugar: ${Math.round(m.macros.sugar * servings)}g` : "",
          m.macros.sodium != null
            ? `Sodium: ${Math.round(m.macros.sodium * servings)}mg`
            : "",
        ]
          .filter(Boolean)
          .join(" | "),
        loggedAt: now,
        source: m.provider as string,
        externalId: m.externalId,
      };
    });

    return NextResponse.json({
      accepted: mealEntries.length,
      meals: mealEntries,
    });
  } catch (err) {
    console.error("Cooking webhook error:", err);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

/** Rough meal-type guess based on current time */
function guessMealType(): "breakfast" | "lunch" | "dinner" | "snack" {
  const h = new Date().getHours();
  if (h < 10) return "breakfast";
  if (h < 14) return "lunch";
  if (h < 20) return "dinner";
  return "snack";
}
