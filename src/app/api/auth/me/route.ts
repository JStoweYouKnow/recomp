import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { dbGetProfile, dbVerifyAccount } from "@/lib/db";
import { logInfo, logError } from "@/lib/logger";

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserId(req.headers);
    if (!userId) {
      logInfo("Auth check: unauthenticated", { route: "auth/me" });
      return NextResponse.json({ authenticated: false, profile: null, hasCredentials: false });
    }
    const profile = await dbGetProfile(userId);
    // Check whether this session's userId actually has server-side credentials
    // (email in localStorage ≠ credentials in DynamoDB).
    let hasCredentials = false;
    if (profile?.email) {
      const account = await dbVerifyAccount(profile.email).catch(() => null);
      hasCredentials = account?.userId === userId;
    }
    logInfo("Auth check: authenticated", { route: "auth/me", userId, hasCredentials });
    return NextResponse.json({ authenticated: true, userId, profile, hasCredentials });
  } catch (err) {
    logError("Auth/me failed", err, { route: "auth/me" });
    return NextResponse.json({ authenticated: false, profile: null, hasCredentials: false });
  }
}
