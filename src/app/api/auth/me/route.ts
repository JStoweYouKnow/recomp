import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { dbGetProfile, dbCreateApiToken } from "@/lib/db";
import { logInfo, logError } from "@/lib/logger";
import { hasProAccess } from "@/lib/proAccess";

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserId(req.headers);
    if (!userId) {
      logInfo("Auth check: unauthenticated", { route: "auth/me" });
      return NextResponse.json({ authenticated: false, profile: null });
    }
    const profile = await dbGetProfile(userId);
    if (profile && hasProAccess(userId)) profile.proAccess = true;
    logInfo("Auth check: authenticated", { route: "auth/me", userId });

    // Always return a fresh API token so mobile clients that authenticated via
    // cookie (first launch, web login) get a token they can use for Bearer auth.
    let apiToken: string | undefined;
    try {
      apiToken = await dbCreateApiToken(userId);
    } catch {
      // Non-fatal — client can retry on next login
    }

    return NextResponse.json({ authenticated: true, userId, profile, apiToken });
  } catch (err) {
    logError("Auth/me failed", err, { route: "auth/me" });
    return NextResponse.json({ authenticated: false, profile: null });
  }
}
