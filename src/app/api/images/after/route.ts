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

const NEGATIVE_TEXT = "cartoon, anime, illustration, painting, distorted face, changed face, different person, extra limbs, blur, deformed, disfigured, bad anatomy, wrong proportions, watermark, text, logo";

function getGoalPrompt(goal: Goal): { text: string; negativeText: string } {
  const identity = "CRITICAL: This must look like the EXACT SAME PERSON. Preserve their face, facial features, skin tone, hair color, hair style, ethnicity, and body proportions precisely. Only modify body composition.";
  switch (goal) {
    case "lose_weight":
      return {
        text: `${identity} Show this same person with a leaner, slimmer physique — reduced body fat, more defined waistline, visible muscle tone underneath. Keep the exact same face, skin tone, hair, clothing, pose, lighting, and background. Photorealistic fitness transformation photo.`,
        negativeText: NEGATIVE_TEXT,
      };
    case "build_muscle":
      return {
        text: `${identity} Show this same person with a more muscular, athletic physique — increased muscle mass in arms, chest, shoulders, and legs, visible muscle definition. Keep the exact same face, skin tone, hair, clothing, pose, lighting, and background. Photorealistic fitness transformation photo.`,
        negativeText: NEGATIVE_TEXT,
      };
    case "improve_endurance":
      return {
        text: `${identity} Show this same person with a leaner, more athletic build — toned muscles, reduced body fat, fit runner's physique. Keep the exact same face, skin tone, hair, clothing, pose, lighting, and background. Photorealistic fitness transformation photo.`,
        negativeText: NEGATIVE_TEXT,
      };
    case "maintain":
    default:
      return {
        text: `${identity} Show this same person looking healthy, fit, and well-maintained — slightly more toned, healthy skin glow. Keep the exact same face, skin tone, hair, clothing, pose, lighting, and background. Photorealistic photo.`,
        negativeText: NEGATIVE_TEXT,
      };
  }
}

export async function POST(req: NextRequest) {
  if (requireAuthForAI()) {
    const userId = await getUserId(req.headers);
    if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  try {
    const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "images-after"), 5, 60_000);
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
      similarityStrength: 0.9,
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
