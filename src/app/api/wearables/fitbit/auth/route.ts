import { NextResponse } from "next/server";
import crypto from "crypto";
import { getSecureCookieOptions } from "@/lib/auth";

const FITBIT_AUTH = "https://www.fitbit.com/oauth2/authorize";
const SCOPES = "activity sleep heartrate profile";
const REDIRECT = process.env.FITBIT_REDIRECT_URI ?? "http://localhost:3000/api/wearables/fitbit/callback";

export async function GET() {
  const clientId = process.env.FITBIT_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "FITBIT_CLIENT_ID not configured" }, { status: 503 });
  }
  const state = crypto.randomBytes(24).toString("hex");
  const url = new URL(FITBIT_AUTH);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", REDIRECT);
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("state", state);
  const res = NextResponse.redirect(url.toString());
  res.cookies.set("fitbit_oauth_state", state, getSecureCookieOptions(60 * 10));
  return res;
}
