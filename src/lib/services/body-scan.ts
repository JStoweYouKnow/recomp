/**
 * Body scan domain service.
 * Business logic for progress reel. No HTTP concerns.
 */

import { startNovaReelVideo, getNovaReelStatus } from "@/lib/nova";

export interface ProgressReelInput {
  scanDates: string[];
  userId: string;
  s3Bucket: string;
  s3Prefix: string;
}

export interface ProgressReelStartResult {
  status: "processing";
  jobId: string;
  message: string;
  scanCount: number;
}

export interface ProgressReelFallbackResult {
  status: "completed";
  videoUrl: string;
  message: string;
  source: "judge-fallback" | "s3-unconfigured-fallback";
  isDemo: true;
}

export interface ProgressReelPollResult {
  status: string;
  videoUrl?: string | null;
  failureMessage?: string;
}

/** Stable demo video for judge/demo mode when S3 is not configured. Action-oriented clip. */
export const DEMO_PROGRESS_REEL_VIDEO =
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";

export function buildProgressReelPrompt(scanDates: string[]): string {
  const sorted = [...scanDates].sort();
  return `Fitness transformation progress from ${sorted[0]} to ${sorted[sorted.length - 1]}. ${scanDates.length} body scans over time. Motivational before and after.`;
}

export async function startProgressReel(input: ProgressReelInput): Promise<ProgressReelStartResult> {
  const prompt = buildProgressReelPrompt(input.scanDates);
  const s3Uri = `s3://${input.s3Bucket}/${input.s3Prefix}/${input.userId}/${Date.now()}/`;
  const { invocationArn } = await startNovaReelVideo(prompt, s3Uri);
  return {
    status: "processing",
    jobId: invocationArn,
    message: `Generating progress reel from ${input.scanDates.length} scans. Poll with POST { action: "poll", jobId } or GET ?jobId=...`,
    scanCount: input.scanDates.length,
  };
}

export async function pollProgressReel(
  jobId: string,
  getPresignedUrl: (s3Uri: string) => Promise<string | null>
): Promise<ProgressReelPollResult> {
  const { status, outputLocation, failureMessage } = await getNovaReelStatus(jobId);
  let videoUrl: string | null = null;
  if (status === "Completed" && outputLocation) {
    videoUrl = await getPresignedUrl(outputLocation);
  }
  return { status, videoUrl, failureMessage };
}
