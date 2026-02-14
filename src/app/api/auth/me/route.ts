import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { dbGetProfile } from "@/lib/db";
import { logInfo, logError } from "@/lib/logger";

export async function GET() {
  try {
    const userId = await getUserId();
    if (!userId) {
      logInfo("Auth check: unauthenticated", { route: "auth/me" });
      return NextResponse.json({ authenticated: false, profile: null });
    }
    const profile = await dbGetProfile(userId);
    logInfo("Auth check: authenticated", { route: "auth/me", userId });
    return NextResponse.json({ authenticated: true, profile });
  } catch (err) {
    logError("Auth/me failed", err, { route: "auth/me" });
    return NextResponse.json({ authenticated: false, profile: null });
  }
}
