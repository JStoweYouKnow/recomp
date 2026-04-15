/**
 * Journey Recap service.
 * Builds a rich, personalized Nova Reel prompt from real user data.
 */

import { startNovaReelVideo, getNovaReelStatus } from "@/lib/nova";

export interface JourneyRecapData {
  name: string;
  goal: string; // e.g. "fat loss", "building muscle"
  daysActive: number;
  weeksActive: number;
  totalMealsLogged: number;
  currentStreak: number;
  badgesEarned: number;
  level: number;
  xp: number;
}

export interface JourneyRecapStartResult {
  status: "processing";
  jobId: string;
  message: string;
}

export interface JourneyRecapFallbackResult {
  status: "completed";
  videoUrl: string;
  message: string;
  source: "judge-fallback" | "s3-unconfigured-fallback";
  isDemo: true;
}

export interface JourneyRecapPollResult {
  status: string;
  videoUrl?: string | null;
  failureMessage?: string;
}

export const DEMO_JOURNEY_RECAP_VIDEO =
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";

export function buildJourneyRecapPrompt(data: JourneyRecapData): string {
  const parts: string[] = [];

  parts.push(
    `A cinematic fitness journey montage for someone pursuing ${data.goal} over ${data.weeksActive} weeks.`
  );

  if (data.totalMealsLogged > 0) {
    parts.push(
      `Scenes of disciplined meal prep and healthy cooking — they tracked ${data.totalMealsLogged} meals.`
    );
  }

  if (data.currentStreak >= 3) {
    parts.push(
      `A calendar showing a ${data.currentStreak}-day consistency streak highlighted in green.`
    );
  }

  parts.push(
    "Morning gym sessions with determination. Overhead shots of colorful balanced plates."
  );

  if (data.badgesEarned > 0) {
    parts.push(
      `Quick cuts of achievement unlocks — ${data.badgesEarned} milestones earned.`
    );
  }

  parts.push(
    "Close with a confident, energized person looking at their progress. Warm golden-hour lighting, documentary style, motivational tone."
  );

  // Nova Reel has a 512-char limit
  return parts.join(" ").slice(0, 512);
}

export async function startJourneyRecap(
  data: JourneyRecapData,
  userId: string,
  s3Bucket: string,
  s3Prefix: string
): Promise<JourneyRecapStartResult> {
  const prompt = buildJourneyRecapPrompt(data);
  const s3Uri = `s3://${s3Bucket}/${s3Prefix}/${userId}/${Date.now()}/`;
  const { invocationArn } = await startNovaReelVideo(prompt, s3Uri);
  return {
    status: "processing",
    jobId: invocationArn,
    message: `Generating your journey recap — ${data.totalMealsLogged} meals, ${data.weeksActive} weeks, ${data.badgesEarned} badges. This may take a few minutes.`,
  };
}

export async function pollJourneyRecap(
  jobId: string,
  getPresignedUrl: (s3Uri: string) => Promise<string | null>
): Promise<JourneyRecapPollResult> {
  const { status, outputLocation, failureMessage } = await getNovaReelStatus(jobId);
  let videoUrl: string | null = null;
  if (status === "Completed" && outputLocation) {
    videoUrl = await getPresignedUrl(outputLocation);
  }
  return { status, videoUrl, failureMessage };
}
