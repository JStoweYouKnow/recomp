/**
 * Returns build info so you can confirm the latest deploy is live.
 * GET /api/version
 */
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
    actServiceUrl: process.env.ACT_SERVICE_URL ? "configured" : "not set",
    timestamp: new Date().toISOString(),
  });
}
