import { NextRequest, NextResponse } from "next/server";
import { invokeNovaCanvas } from "@/lib/nova";
import {
  fixedWindowRateLimit,
  getClientKey,
  getRateLimitHeaderValues,
  getRequestIp,
} from "@/lib/server-rate-limit";

export async function POST(req: NextRequest) {
  try {
    const rl = fixedWindowRateLimit(getClientKey(getRequestIp(req), "images-generate"), 20, 60_000);
    if (!rl.ok) {
      const headers = getRateLimitHeaderValues(rl);
      const res = NextResponse.json({ error: "Rate limit exceeded. Try again shortly." }, { status: 429 });
      res.headers.set("X-RateLimit-Limit", headers.limit);
      res.headers.set("X-RateLimit-Remaining", headers.remaining);
      res.headers.set("X-RateLimit-Reset", headers.reset);
      res.headers.set("Retry-After", headers.retryAfter);
      return res;
    }

    const { prompt, type } = await req.json();
    const text = typeof prompt === "string" ? prompt : "A healthy balanced meal";

    let finalPrompt = text;
    if (type === "meal") {
      finalPrompt = `Professional food photography of a delicious, nutritious ${text}. Appetizing, well-lit, high quality.`;
    } else if (type === "workout") {
      finalPrompt = `Illustration of someone performing the exercise: ${text}. Clear form, fitness style.`;
    } else if (type === "motivational") {
      finalPrompt = `Motivational fitness poster: ${text}. Bold typography, energetic.`;
    }

    const base64Image = await invokeNovaCanvas(finalPrompt);
    const res = NextResponse.json({ image: base64Image });
    const headers = getRateLimitHeaderValues(rl);
    res.headers.set("X-RateLimit-Limit", headers.limit);
    res.headers.set("X-RateLimit-Remaining", headers.remaining);
    res.headers.set("X-RateLimit-Reset", headers.reset);
    return res;
  } catch (err) {
    console.error("Image gen error:", err);
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}
