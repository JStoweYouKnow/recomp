import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getUserId } from "@/lib/auth";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { logError, logInfo } from "@/lib/logger";
import { isJudgeMode } from "@/lib/judgeMode";
import {
  startProgressReel,
  pollProgressReel,
  DEMO_PROGRESS_REEL_VIDEO,
} from "@/lib/services/body-scan";

export const maxDuration = 60;

function normalizeBucket(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return raw.replace(/^s3:\/\//, "").split("/")[0].replace(/\/+$/, "");
}

function parseS3Uri(uri: string): { bucket: string; key: string } | null {
  const m = uri.match(/^s3:\/\/([^/]+)\/(.+)$/);
  if (!m) return null;
  return { bucket: m[1], key: m[2].replace(/\/+$/, "") };
}

async function getPresignedVideoUrl(s3FolderUri: string, expiresIn = 3600): Promise<string | null> {
  const parsed = parseS3Uri(s3FolderUri);
  if (!parsed) return null;
  const key = parsed.key.endsWith("/") ? `${parsed.key}output.mp4` : `${parsed.key}/output.mp4`;
  const client = new S3Client({ region: process.env.AWS_REGION ?? "us-east-1" });
  const command = new GetObjectCommand({ Bucket: parsed.bucket, Key: key });
  return getSignedUrl(client, command, { expiresIn });
}

const S3_BUCKET = normalizeBucket(process.env.NOVA_REEL_S3_BUCKET);
const S3_PREFIX = (process.env.NOVA_REEL_S3_PREFIX ?? "recomp-progress-reel").replace(/^\/|\/$/g, "");

export async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "progress-reel"), 2, 3600_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded (2/hour)", code: "RATE_LIMIT" }, { status: 429 });

  const userId = await getUserId(req.headers);
  if (!userId) return NextResponse.json({ error: "Authentication required", code: "UNAUTHORIZED" }, { status: 401 });

  try {
    const body = await req.json();
    const { scanDates, action, jobId } = body;

    // Poll existing job
    if (action === "poll" && typeof jobId === "string" && jobId.trim()) {
      const result = await pollProgressReel(jobId.trim(), getPresignedVideoUrl);
      return NextResponse.json(result);
    }

    // Start new job
    if (!scanDates || !Array.isArray(scanDates) || scanDates.length < 2) {
      return NextResponse.json({ error: "At least 2 body scans required", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    const useReelFallback = !S3_BUCKET || isJudgeMode();

    if (useReelFallback) {
      logInfo("Progress reel fallback (no S3 or JUDGE_MODE)", { route: "body-scan/progress-reel", scanCount: scanDates.length });
      return NextResponse.json({
        status: "completed",
        videoUrl: DEMO_PROGRESS_REEL_VIDEO,
        message: "Demo video returned. Set NOVA_REEL_S3_BUCKET for live Nova Reel generation.",
        source: isJudgeMode() ? "judge-fallback" : "s3-unconfigured-fallback",
        isDemo: true,
      });
    }

    const result = await startProgressReel({
      scanDates,
      userId,
      s3Bucket: S3_BUCKET,
      s3Prefix: S3_PREFIX,
    });
    logInfo("Progress reel started", { route: "body-scan/progress-reel", jobId: result.jobId, scanCount: result.scanCount });
    return NextResponse.json(result);
  } catch (err) {
    logError("Progress reel failed", err, { route: "body-scan/progress-reel" });
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Progress reel generation failed", code: "INTERNAL_ERROR", detail }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "progress-reel-poll"), 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded", code: "RATE_LIMIT" }, { status: 429 });

  const userId = await getUserId(req.headers);
  if (!userId) return NextResponse.json({ error: "Authentication required", code: "UNAUTHORIZED" }, { status: 401 });

  const jobId = req.nextUrl.searchParams.get("jobId");
  if (!jobId?.trim()) {
    return NextResponse.json({ error: "Missing jobId query parameter", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  try {
    const result = await pollProgressReel(jobId.trim(), getPresignedVideoUrl);
    return NextResponse.json(result);
  } catch (err) {
    logError("Progress reel poll failed", err, { route: "body-scan/progress-reel", jobId });
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Failed to fetch job status", code: "INTERNAL_ERROR", detail }, { status: 500 });
  }
}
