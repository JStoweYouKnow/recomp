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

const NEGATIVE_TEXT = "face, head, cartoon, anime, illustration, painting, different skin color, changed skin tone, lighter skin, darker skin, changed ethnicity, extra limbs, blur, deformed, disfigured, bad anatomy, wrong proportions, watermark, text, logo, unrealistic, exaggerated muscles, bodybuilder";

function getGoalPrompt(goal: Goal): { text: string; negativeText: string } {
  const framing = "Photo framed from the neck down showing only the torso, arms, and legs. No face or head visible. Preserve the exact same skin tone, clothing, pose, lighting, and background from the source image.";
  switch (goal) {
    case "lose_weight":
      return {
        text: `${framing} Show a realistic, naturally achievable body after consistent fat loss — moderately leaner midsection, slightly more defined arms and waist. Subtle, believable changes like someone who lost 15-20 lbs over several months. Photorealistic photo, natural body.`,
        negativeText: NEGATIVE_TEXT,
      };
    case "build_muscle":
      return {
        text: `${framing} Show a realistic, naturally achievable body after consistent strength training — moderately more defined arms, chest, and shoulders, slightly broader upper body. Subtle, believable changes like someone who gained 10-15 lbs of muscle over several months. Photorealistic photo, natural body.`,
        negativeText: NEGATIVE_TEXT,
      };
    case "improve_endurance":
      return {
        text: `${framing} Show a realistic, naturally achievable body after consistent cardio training — lean and toned, slightly slimmer midsection, defined legs. Subtle, believable changes like an active runner or cyclist. Photorealistic photo, natural body.`,
        negativeText: NEGATIVE_TEXT,
      };
    case "maintain":
    default:
      return {
        text: `${framing} Show the same body looking healthy, well-maintained, and slightly more toned — minimal changes, just a healthier, more vibrant appearance. Photorealistic photo, natural body.`,
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
