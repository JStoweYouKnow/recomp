import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

/**
 * POST /api/cooking/webhook/test
 * Sends a signed test payload to the webhook endpoint to verify the connection.
 * Uses COOKING_WEBHOOK_SECRET to sign; returns success if the webhook accepts it.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.COOKING_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { success: false, error: "COOKING_WEBHOOK_SECRET is not set" },
      { status: 503 }
    );
  }

  const origin = req.nextUrl.origin;
  const webhookUrl = `${origin}/api/cooking/webhook`;

  const body = JSON.stringify({
    meals: [
      {
        provider: "custom",
        name: "Recomp webhook test meal",
        mealType: "snack" as const,
        macros: { calories: 0, protein: 0, carbs: 0, fat: 0 },
      },
    ],
  });

  const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-signature": signature,
      },
      body,
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && (data.accepted === 1 || data.meals?.length === 1)) {
      return NextResponse.json({
        success: true,
        message: "Webhook accepted the signed test payload. Connection verified.",
      });
    }
    return NextResponse.json(
      {
        success: false,
        status: res.status,
        error: (data as { error?: string }).error ?? res.statusText,
      },
      { status: 200 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Request failed",
      },
      { status: 200 }
    );
  }
}
