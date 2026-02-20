import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { z } from "zod";
import crypto from "crypto";

/**
 * Cooking App Connection Manager
 *
 * POST – Register a new cooking app connection and generate a webhook secret.
 * GET  – List active cooking app connections.
 * DELETE – Remove a cooking app connection.
 */

const PROVIDERS = [
  "whisk",
  "mealime",
  "yummly",
  "paprika",
  "cronometer",
  "myfitnesspal",
  "loseit",
  "recipekeeper",
  "nytcooking",
  "custom",
] as const;

const connectSchema = z.object({
  provider: z.enum(PROVIDERS),
  label: z.string().max(120).optional(),
});

const disconnectSchema = z.object({
  provider: z.enum(PROVIDERS),
});

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const parsed = connectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { provider, label } = parsed.data;
    const webhookSecret = crypto.randomBytes(32).toString("hex");

    return NextResponse.json({
      provider,
      label: label ?? provider,
      connectedAt: new Date().toISOString(),
      webhookSecret,
      webhookUrl: `${req.nextUrl.origin}/api/cooking/webhook`,
      instructions: getConnectionInstructions(provider),
    });
  } catch (err) {
    console.error("Cooking connect error:", err);
    return NextResponse.json(
      { error: "Connection failed" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const parsed = disconnectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    return NextResponse.json({ disconnected: parsed.data.provider });
  } catch (err) {
    console.error("Cooking disconnect error:", err);
    return NextResponse.json(
      { error: "Disconnect failed" },
      { status: 500 }
    );
  }
}

function getConnectionInstructions(provider: string): string {
  switch (provider) {
    case "cronometer":
      return "Export your daily nutrition summary as JSON from Cronometer Settings > Export Data, then use the Import button in Recomp, or configure a webhook using the secret above.";
    case "myfitnesspal":
      return "Use the MyFitnessPal CSV export (Settings > Diary Settings > Export) or connect via our webhook. Paste your webhook secret into the MyFitnessPal integration settings.";
    case "yummly":
      return "In Yummly, enable third-party sharing under Account > Integrations. Use the webhook URL and secret above.";
    case "whisk":
      return "In Whisk, go to Settings > Connected Apps and add a new webhook with the URL and secret above.";
    case "mealime":
      return "Mealime supports manual export. Export your weekly plan as JSON, then use the Import button in Recomp.";
    case "paprika":
      return "In Paprika, export recipes or meal plans as HTML or text. Use our Import feature to upload them.";
    case "loseit":
      return "LoseIt allows CSV diary exports. Download from Account > Export Data, then import in Recomp.";
    case "recipekeeper":
      return "Recipe Keeper doesn't support webhooks. Use the Import tab: export recipes (or copy recipe text) from Recipe Keeper, then paste or upload in Recomp. Nova AI will parse ingredients and nutrition.";
    case "nytcooking":
      return "NYT Cooking doesn't support webhooks. Use the Import tab: copy a recipe from the NYT Cooking app or site, then paste into Recomp. Nova AI will parse it into a meal with macros.";
    default:
      return "Use the webhook URL and secret above to send meal data to Recomp. See our API documentation for the payload format.";
  }
}
