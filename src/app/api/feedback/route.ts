import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { dbSaveFeedback } from "@/lib/db";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";

export async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "feedback"), 5, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });

  try {
    const body = await req.json();
    const rating = typeof body.rating === "number" && body.rating >= 1 && body.rating <= 5 ? body.rating : undefined;
    const text = typeof body.text === "string" ? body.text.trim().slice(0, 2000) : undefined;

    if (!rating && !text) {
      return NextResponse.json({ error: "Please provide a rating (1-5) or feedback text." }, { status: 400 });
    }

    const userId = getUserId(req.headers) ?? undefined;
    const entry = {
      rating,
      text: text || undefined,
      userId,
      createdAt: new Date().toISOString(),
    };

    await dbSaveFeedback(entry);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Feedback save error:", err);
    const msg = process.env.DYNAMODB_TABLE_NAME
      ? "Failed to save feedback."
      : "Feedback storage not configured. Set DYNAMODB_TABLE_NAME to store feedback.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
