import { NextRequest, NextResponse } from "next/server";
import { getSecureCookieOptions } from "@/lib/auth";

const REDIRECT = process.env.FITBIT_REDIRECT_URI ?? "http://localhost:3000/api/wearables/fitbit/callback";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  if (error) {
    return NextResponse.redirect(`${baseUrl}/?wearable=fitbit_error&message=${encodeURIComponent(error)}`);
  }
  if (!code) {
    return NextResponse.redirect(`${baseUrl}/?wearable=fitbit_error&message=missing_code`);
  }

  const expectedState = req.cookies.get("fitbit_oauth_state")?.value;
  if (!state || !expectedState || state !== expectedState) {
    const badStateRes = NextResponse.redirect(
      `${baseUrl}/?wearable=fitbit_error&message=invalid_oauth_state`
    );
    badStateRes.cookies.set("fitbit_oauth_state", "", getSecureCookieOptions(0));
    return badStateRes;
  }

  const clientId = process.env.FITBIT_CLIENT_ID;
  const clientSecret = process.env.FITBIT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${baseUrl}/?wearable=fitbit_error&message=not_configured`);
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://api.fitbit.com/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${auth}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.redirect(`${baseUrl}/?wearable=fitbit_error&message=${encodeURIComponent(err.slice(0, 50))}`);
  }

  const data = await res.json();
  const response = NextResponse.redirect(`${baseUrl}/?wearable=fitbit_connected`);
  response.cookies.set("fitbit_oauth_state", "", getSecureCookieOptions(0));
  response.cookies.set(
    "fitbit_access_token",
    data.access_token,
    getSecureCookieOptions(data.expires_in ?? 28800)
  );
  response.cookies.set(
    "fitbit_refresh_token",
    data.refresh_token,
    getSecureCookieOptions(60 * 60 * 24 * 365)
  );
  return response;
}
