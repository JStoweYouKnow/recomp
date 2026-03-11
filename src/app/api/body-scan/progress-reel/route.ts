import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getUserId } from "@/lib/auth";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { logError, logInfo } from "@/lib/logger";
import { isJudgeMode } from "@/lib/judgeMode";
import {
  startJourneyRecap,
  pollJourneyRecap,
  DEMO_JOURNEY_RECAP_VIDEO,
  type JourneyRecapData,
} from "@/lib/services/journey-recap";

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
const S3_PREFIX = (process.env.NOVA_REEL_S3_PREFIX ?? "recomp-journey-recap").replace(/^\/|\/$/g, "");

export async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "journey-recap"), 2, 3600_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded (2/hour)", code: "RATE_LIMIT" }, { status: 429 });

  const userId = await getUserId(req.headers);
  if (!userId) return NextResponse.json({ error: "Authentication required", code: "UNAUTHORIZED" }, { status: 401 });

  try {
    const body = await req.json();
    const { action, jobId } = body;

    // Poll existing job
    if (action === "poll" && typeof jobId === "string" && jobId.trim()) {
      const result = await pollJourneyRecap(jobId.trim(), getPresignedVideoUrl);
      return NextResponse.json(result);
    }

    // Validate recap data
    const recapData: JourneyRecapData = {
      name: typeof body.name === "string" ? body.name.slice(0, 50) : "User",
      goal: typeof body.goal === "string" ? body.goal.slice(0, 50) : "fitness",
      daysActive: Math.max(1, Number(body.daysActive) || 1),
      weeksActive: Math.max(1, Number(body.weeksActive) || 1),
      totalMealsLogged: Math.max(0, Number(body.totalMealsLogged) || 0),
      currentStreak: Math.max(0, Number(body.currentStreak) || 0),
      badgesEarned: Math.max(0, Number(body.badgesEarned) || 0),
      level: Math.max(1, Number(body.level) || 1),
      xp: Math.max(0, Number(body.xp) || 0),
    };

    if (recapData.totalMealsLogged < 5) {
      return NextResponse.json({ error: "Log at least 5 meals before generating a journey recap", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    const useReelFallback = !S3_BUCKET || isJudgeMode();

    if (useReelFallback) {
      logInfo("Journey recap fallback (no S3 or JUDGE_MODE)", { route: "journey-recap", meals: recapData.totalMealsLogged });
      return NextResponse.json({
        status: "completed",
        videoUrl: DEMO_JOURNEY_RECAP_VIDEO,
        message: "Demo video returned. Set NOVA_REEL_S3_BUCKET for live Nova Reel generation.",
        source: isJudgeMode() ? "judge-fallback" : "s3-unconfigured-fallback",
        isDemo: true,
      });
    }

    const result = await startJourneyRecap(recapData, userId, S3_BUCKET, S3_PREFIX);
    logInfo("Journey recap started", { route: "journey-recap", jobId: result.jobId });
    return NextResponse.json(result);
  } catch (err) {
    logError("Journey recap failed", err, { route: "journey-recap" });
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Journey recap generation failed", code: "INTERNAL_ERROR", detail }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "journey-recap-poll"), 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded", code: "RATE_LIMIT" }, { status: 429 });

  const userId = await getUserId(req.headers);
  if (!userId) return NextResponse.json({ error: "Authentication required", code: "UNAUTHORIZED" }, { status: 401 });

  const jobId = req.nextUrl.searchParams.get("jobId");
  if (!jobId?.trim()) {
    return NextResponse.json({ error: "Missing jobId query parameter", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  try {
    const result = await pollJourneyRecap(jobId.trim(), getPresignedVideoUrl);
    return NextResponse.json(result);
  } catch (err) {
    logError("Journey recap poll failed", err, { route: "journey-recap", jobId });
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Failed to fetch job status", code: "INTERNAL_ERROR", detail }, { status: 500 });
  }
}
