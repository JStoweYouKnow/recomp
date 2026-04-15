import { NextResponse } from "next/server";

/**
 * GET /api/cooking/webhook/verify
 * Returns whether the server is configured to accept server-to-server webhooks
 * (COOKING_WEBHOOK_SECRET is set). Does not verify an actual delivery.
 */
export async function GET() {
  const configured = Boolean(process.env.COOKING_WEBHOOK_SECRET);
  return NextResponse.json({
    configured,
    message: configured
      ? "Webhook secret is set. Use 'Test connection' to send a signed request to the webhook."
      : "Set COOKING_WEBHOOK_SECRET in .env.local to verify server-to-server webhooks.",
  });
}
