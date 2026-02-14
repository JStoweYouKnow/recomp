import { NextRequest, NextResponse } from "next/server";
import { invokeNovaWithImage } from "@/lib/nova";
import {
  fixedWindowRateLimit,
  getClientKey,
  getRateLimitHeaderValues,
  getRequestIp,
} from "@/lib/server-rate-limit";

const SYSTEM = `You are a nutrition analyst. Analyze the meal in this image and estimate calories and macros.
Respond with valid JSON only: {"name": "meal description", "calories": number, "protein": number, "carbs": number, "fat": number}
Be reasonable - these are estimates.`;

export async function POST(req: NextRequest) {
  try {
    const rl = fixedWindowRateLimit(getClientKey(getRequestIp(req), "meals-analyze-photo"), 20, 60_000);
    if (!rl.ok) {
      const headers = getRateLimitHeaderValues(rl);
      const res = NextResponse.json({ error: "Rate limit exceeded. Try again shortly." }, { status: 429 });
      res.headers.set("X-RateLimit-Limit", headers.limit);
      res.headers.set("X-RateLimit-Remaining", headers.remaining);
      res.headers.set("X-RateLimit-Reset", headers.reset);
      res.headers.set("Retry-After", headers.retryAfter);
      return res;
    }

    const formData = await req.formData();
    const file = formData.get("image") as File | null;
    if (!file) return NextResponse.json({ error: "Image required" }, { status: 400 });
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Image too large (max 10MB)" }, { status: 413 });
    }

    const buf = await file.arrayBuffer();
    const base64 = Buffer.from(buf).toString("base64");
    const format = (file.type === "image/png" ? "png" : "jpeg") as "png" | "jpeg";

    const raw = await invokeNovaWithImage(SYSTEM, "Estimate the nutrition for this meal.", base64, format);
    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : { name: "Meal", calories: 0, protein: 0, carbs: 0, fat: 0 };
    const res = NextResponse.json(parsed);
    const headers = getRateLimitHeaderValues(rl);
    res.headers.set("X-RateLimit-Limit", headers.limit);
    res.headers.set("X-RateLimit-Remaining", headers.remaining);
    res.headers.set("X-RateLimit-Reset", headers.reset);
    return res;
  } catch (err) {
    console.error("Photo analyze error:", err);
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}
