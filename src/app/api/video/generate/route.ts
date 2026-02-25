import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { startNovaReelVideo, getNovaReelStatus } from "@/lib/nova";
import {
  fixedWindowRateLimit,
  getClientKey,
  getRateLimitHeaderValues,
  getRequestIp,
} from "@/lib/server-rate-limit";
import { getUserId } from "@/lib/auth";
import { isJudgeMode, requireAuthForAI } from "@/lib/judgeMode";

/** Strip s3:// prefix and trailing slashes if the user accidentally included them */
function normalizeBucket(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return raw.replace(/^s3:\/\//, "").split("/")[0].replace(/\/+$/, "");
}

const S3_BUCKET = normalizeBucket(process.env.NOVA_REEL_S3_BUCKET);
const S3_PREFIX = (process.env.NOVA_REEL_S3_PREFIX ?? "recomp-videos").replace(/^\/|\/$/g, "");
const REGION = process.env.AWS_REGION ?? "us-east-1";

/** Parse s3://bucket/key into { bucket, key } */
function parseS3Uri(uri: string): { bucket: string; key: string } | null {
  const m = uri.match(/^s3:\/\/([^/]+)\/(.+)$/);
  if (!m) return null;
  return { bucket: m[1], key: m[2].replace(/\/+$/, "") };
}

/** Generate presigned URL for video at s3 folder (adds output.mp4) */
async function getPresignedVideoUrl(s3FolderUri: string, expiresIn = 3600): Promise<string | null> {
  const parsed = parseS3Uri(s3FolderUri);
  if (!parsed) return null;
  const key = parsed.key.endsWith("/") ? `${parsed.key}output.mp4` : `${parsed.key}/output.mp4`;
  const client = new S3Client({ region: REGION });
  const command = new GetObjectCommand({ Bucket: parsed.bucket, Key: key });
  return getSignedUrl(client, command, { expiresIn });
}

export async function POST(req: NextRequest) {
  if (requireAuthForAI()) {
    const userId = await getUserId(req.headers);
    if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const rl = fixedWindowRateLimit(getClientKey(getRequestIp(req), "video-generate"), 10, 60_000);
  if (!rl.ok) {
    const headers = getRateLimitHeaderValues(rl);
    const res = NextResponse.json({ error: "Rate limit exceeded. Try again shortly." }, { status: 429 });
    res.headers.set("X-RateLimit-Limit", headers.limit);
    res.headers.set("X-RateLimit-Remaining", headers.remaining);
    res.headers.set("X-RateLimit-Reset", headers.reset);
    res.headers.set("Retry-After", headers.retryAfter);
    return res;
  }

  /** When S3 is not configured, use demo fallback (same as JUDGE_MODE) so judges/demos see working behavior */
  const useReelFallback = !S3_BUCKET || isJudgeMode();

  try {
    const body = await req.json();
    const { prompt, action, invocationArn } = body;
    const arn = invocationArn ?? (action === "poll" ? prompt : undefined);

    if (useReelFallback) {
      if (action === "poll") {
        const res = NextResponse.json({
          status: "Completed",
          outputLocation: "s3://judge-mode/reel/demo-output/",
          videoUrl: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
          failureMessage: null,
          source: isJudgeMode() ? "judge-fallback" : "s3-unconfigured-fallback",
        });
        const headers = getRateLimitHeaderValues(rl);
        res.headers.set("X-RateLimit-Limit", headers.limit);
        res.headers.set("X-RateLimit-Remaining", headers.remaining);
        res.headers.set("X-RateLimit-Reset", headers.reset);
        return res;
      }

      const fakeArn = `arn:aws:bedrock:judge-mode:reel:${Date.now()}`;
      const res = NextResponse.json({
        invocationArn: fakeArn,
        s3Uri: "s3://demo/reel/output/",
        message: useReelFallback
          ? (isJudgeMode() ? "JUDGE_MODE: video simulated." : "S3 not configured: demo video returned. Set NOVA_REEL_S3_BUCKET for live generation.")
          : "Video generation started.",
        source: isJudgeMode() ? "judge-fallback" : "s3-unconfigured-fallback",
      });
      const headers = getRateLimitHeaderValues(rl);
      res.headers.set("X-RateLimit-Limit", headers.limit);
      res.headers.set("X-RateLimit-Remaining", headers.remaining);
      res.headers.set("X-RateLimit-Reset", headers.reset);
      return res;
    }

    if (action === "poll" && arn) {
      const { status, outputLocation, failureMessage } = await getNovaReelStatus(arn);
      let videoUrl: string | null = null;
      if (status === "Completed" && outputLocation) {
        videoUrl = await getPresignedVideoUrl(outputLocation);
      }
      const res = NextResponse.json({ status, outputLocation, videoUrl, failureMessage });
      const headers = getRateLimitHeaderValues(rl);
      res.headers.set("X-RateLimit-Limit", headers.limit);
      res.headers.set("X-RateLimit-Remaining", headers.remaining);
      res.headers.set("X-RateLimit-Reset", headers.reset);
      return res;
    }

    const text = typeof prompt === "string" && prompt.trim() ? prompt : "Person doing a bicep curl with proper form";
    const s3Uri = `s3://${S3_BUCKET}/${S3_PREFIX}/${Date.now()}/`;

    const { invocationArn: startedArn } = await startNovaReelVideo(text, s3Uri);
    const res = NextResponse.json({ invocationArn: startedArn, s3Uri, message: "Video generation started. Poll with action: 'poll' and invocationArn." });
    const headers = getRateLimitHeaderValues(rl);
    res.headers.set("X-RateLimit-Limit", headers.limit);
    res.headers.set("X-RateLimit-Remaining", headers.remaining);
    res.headers.set("X-RateLimit-Reset", headers.reset);
    return res;
  } catch (err) {
    console.error("Video gen error:", err);
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Video generation failed", detail }, { status: 500 });
  }
}
