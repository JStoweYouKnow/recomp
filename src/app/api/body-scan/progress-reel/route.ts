import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { logError, logInfo } from "@/lib/logger";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "progress-reel"), 2, 3600_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded (2/hour)" }, { status: 429 });

  const userId = await getUserId(req.headers);
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    const { scanDates } = await req.json();
    if (!scanDates || !Array.isArray(scanDates) || scanDates.length < 2) {
      return NextResponse.json({ error: "At least 2 body scans required" }, { status: 400 });
    }

    // Nova Reel video generation for progress reel
    // This would use startNovaReelVideo() for actual video generation
    // For now, return a placeholder that the UI can poll
    logInfo("Progress reel requested", { route: "body-scan/progress-reel", scanCount: scanDates.length });

    return NextResponse.json({
      status: "processing",
      message: `Generating progress reel from ${scanDates.length} body scans. This may take a few minutes.`,
      scanCount: scanDates.length,
    });
  } catch (err) {
    logError("Progress reel failed", err, { route: "body-scan/progress-reel" });
    return NextResponse.json({ error: "Progress reel generation failed" }, { status: 500 });
  }
}
