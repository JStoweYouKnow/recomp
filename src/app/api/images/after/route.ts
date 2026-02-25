import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { invokeNovaCanvasImageVariation } from "@/lib/nova";
import type { Goal } from "@/lib/types";
import { requireAuthForAI } from "@/lib/judgeMode";
import {
  fixedWindowRateLimit,
  getClientKey,
  getRateLimitHeaderValues,
  getRequestIp,
} from "@/lib/server-rate-limit";

function getGoalPrompt(goal: Goal): { text: string; negativeText?: string } {
  switch (goal) {
    case "lose_weight":
      return {
        text: "The same person with a leaner, slimmer physique. Reduced body fat, more defined waist. Natural, photorealistic fitness transformation. Same pose, lighting, and background.",
        negativeText: "cartoon, distorted face, extra limbs, blur",
      };
    case "build_muscle":
      return {
        text: "The same person with more muscular, athletic physique. Visible muscle definition, increased muscle mass. Natural, photorealistic fitness transformation. Same pose, lighting, and background.",
        negativeText: "cartoon, distorted face, extra limbs, blur",
      };
    case "improve_endurance":
      return {
        text: "The same person with a leaner, more athletic build. Toned body, fit appearance. Natural, photorealistic fitness transformation. Same pose, lighting, and background.",
        negativeText: "cartoon, distorted face, extra limbs, blur",
      };
    case "maintain":
    default:
      return {
        text: "The same person looking healthy and fit. Slightly toned, well-maintained physique. Natural, photorealistic. Same pose, lighting, and background.",
        negativeText: "cartoon, distorted face, extra limbs, blur",
      };
  }
}

export async function POST(req: NextRequest) {
  if (requireAuthForAI()) {
    const userId = await getUserId(req.headers);
    if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  try {
    const rl = fixedWindowRateLimit(getClientKey(getRequestIp(req), "images-after"), 5, 60_000);
    if (!rl.ok) {
      const headers = getRateLimitHeaderValues(rl);
      const res = NextResponse.json(
        { error: "Rate limit exceeded. Try again in a minute." },
        { status: 429 }
      );
      res.headers.set("X-RateLimit-Limit", headers.limit);
      res.headers.set("X-RateLimit-Remaining", headers.remaining);
      res.headers.set("X-RateLimit-Reset", headers.reset);
      res.headers.set("Retry-After", headers.retryAfter);
      return res;
    }

    const { imageDataUrl, goal } = (await req.json()) as {
      imageDataUrl?: string;
      goal?: Goal;
    };

    if (!imageDataUrl?.startsWith("data:image/")) {
      return NextResponse.json({ error: "Valid image data URL required" }, { status: 400 });
    }
    const safeGoal = (["lose_weight", "maintain", "build_muscle", "improve_endurance"] as const).includes(
      goal as Goal
    )
      ? (goal as Goal)
      : "maintain";

    const { text, negativeText } = getGoalPrompt(safeGoal);
    const base64Image = await invokeNovaCanvasImageVariation(imageDataUrl, text, {
      similarityStrength: 0.75,
      width: 512,
      height: 768,
      negativeText,
    });

    if (!base64Image) {
      return NextResponse.json({ error: "Image generation returned no result" }, { status: 500 });
    }

    const dataUrl = `data:image/png;base64,${base64Image}`;
    const res = NextResponse.json({ image: dataUrl });
    const headers = getRateLimitHeaderValues(rl);
    res.headers.set("X-RateLimit-Limit", headers.limit);
    res.headers.set("X-RateLimit-Remaining", headers.remaining);
    res.headers.set("X-RateLimit-Reset", headers.reset);
    return res;
  } catch (err) {
    console.error("After image gen error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status: 500 }
    );
  }
}
