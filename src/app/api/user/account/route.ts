import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { dbGetProfile, dbDeleteAccount } from "@/lib/db";
import { logInfo, logError } from "@/lib/logger";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";

export async function DELETE(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "delete-account"), 3, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  try {
    const userId = await getUserId(req.headers);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const profile = await dbGetProfile(userId);
    const email = profile?.email ?? "";

    await dbDeleteAccount(userId, email);

    logInfo("Account deleted", { route: "user/account", userId });

    const res = NextResponse.json({ ok: true });
    // Clear the session cookie.
    res.headers.set("Set-Cookie", "recomp_uid=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax");
    return res;
  } catch (err) {
    logError("Account deletion failed", err, { route: "user/account" });
    return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
  }
}
