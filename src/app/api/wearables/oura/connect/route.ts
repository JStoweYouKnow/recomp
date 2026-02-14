import { NextRequest, NextResponse } from "next/server";
import { getSecureCookieOptions, getUserId } from "@/lib/auth";
import { z } from "zod";

const OuraConnectSchema = z.object({
  token: z.string().min(20).max(2048),
});

/** Validate Oura token and store in httpOnly cookie for subsequent fetches */
export async function POST(req: NextRequest) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const parsed = OuraConnectSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Token required" }, { status: 400 });
    }
    const { token } = parsed.data;

    const res = await fetch("https://api.ouraring.com/v2/usercollection/personal_info", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      return NextResponse.json({ error: "Invalid Oura token" }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set("oura_token", token, getSecureCookieOptions(60 * 60 * 24 * 90));
    response.cookies.set("oura_token_uid", userId, getSecureCookieOptions(60 * 60 * 24 * 90));
    return response;
  } catch (err) {
    console.error("Oura connect error:", err);
    return NextResponse.json({ error: "Connection failed" }, { status: 500 });
  }
}
