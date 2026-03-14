import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { dbCreateApiToken, dbRevokeApiToken, dbGetUserIdByApiToken } from "@/lib/db";

/** POST: Create new API token. Returns { token } - user must copy it; we only show it once. */
export async function POST() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    const token = await dbCreateApiToken(userId);
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_APP_URL ?? "https://refactor.app";
    return NextResponse.json({
      token,
      usage: `Authorization: Bearer ${token}`,
      endpoint: `${baseUrl}/api/rico/shortcut`,
      note: "Copy this token now. It won't be shown again.",
    });
  } catch (err) {
    console.error("Create API token error:", err);
    return NextResponse.json({ error: "Could not create token" }, { status: 500 });
  }
}

/** DELETE: Revoke token. Body: { token: "..." } */
export async function DELETE(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    const { token } = await req.json();
    const t = typeof token === "string" ? token.trim() : "";
    if (!t) return NextResponse.json({ error: "token required" }, { status: 400 });

    const tokenUserId = await dbGetUserIdByApiToken(t);
    if (!tokenUserId || tokenUserId !== userId) {
      return NextResponse.json({ error: "Token not found or already revoked" }, { status: 404 });
    }

    await dbRevokeApiToken(userId, t);
    return NextResponse.json({ revoked: true });
  } catch (err) {
    console.error("Revoke API token error:", err);
    return NextResponse.json({ error: "Could not revoke token" }, { status: 500 });
  }
}
