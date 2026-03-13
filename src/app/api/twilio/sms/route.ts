import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { dbGetUserIdByPhone } from "@/lib/db";
import { dbGetMeals, dbGetPlan, dbGetProfile, dbGetMeta } from "@/lib/db";
import { invokeRico, buildRicoContextFromServer } from "@/lib/services/rico";
import { logError } from "@/lib/logger";

/** Twilio webhook for incoming SMS. Configure your Twilio number's "A MESSAGE COMES IN" to this URL. */
export async function POST(req: NextRequest) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const accountSid = process.env.TWILIO_ACCOUNT_SID;

  if (!authToken || !accountSid) {
    console.error("Twilio SMS webhook: TWILIO_AUTH_TOKEN or TWILIO_ACCOUNT_SID not set");
    return new NextResponse("Server not configured for SMS", { status: 503 });
  }

  const url = new URL(req.url);
  const body = await req.text();
  const contentType = req.headers.get("content-type") ?? "";
  let params: URLSearchParams;
  if (contentType.includes("application/x-www-form-urlencoded")) {
    params = new URLSearchParams(body);
  } else {
    return new NextResponse("Invalid content type", { status: 400 });
  }

  const signature = req.headers.get("x-twilio-signature");
  if (!signature) {
    return new NextResponse("Missing signature", { status: 403 });
  }

  const fullUrl = `${url.origin}${url.pathname}${url.search}`;
  const isValid = twilio.validateRequest(authToken, signature, fullUrl, params);
  if (!isValid) {
    return new NextResponse("Invalid signature", { status: 403 });
  }

  const from = params.get("From") ?? "";
  const to = params.get("To") ?? "";
  const smsBody = (params.get("Body") ?? "").trim();

  const MessagingResponse = twilio.twiml.MessagingResponse;

  if (!smsBody || smsBody.length > 2000) {
    const res = new MessagingResponse();
    res.message("Keep it under 2000 characters, please.");
    return new NextResponse(res.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  }

  try {
    const userId = await dbGetUserIdByPhone(from);
    if (!userId) {
      const res = new MessagingResponse();
      res.message(
        "This number isn't linked to Recomp. Open the app, go to Profile → Rico on the go, and link your phone to text Reco."
      );
      return new NextResponse(res.toString(), {
        headers: { "Content-Type": "text/xml" },
      });
    }

    const [meals, plan, profile, meta] = await Promise.all([
      dbGetMeals(userId),
      dbGetPlan(userId),
      dbGetProfile(userId),
      dbGetMeta(userId),
    ]);

    const context = buildRicoContextFromServer({
      meals,
      plan,
      profile: profile ?? undefined,
      meta,
    });

    const { reply } = await invokeRico({
      message: smsBody,
      context,
    });

    const res = new MessagingResponse();
    const truncated = reply.length > 1600 ? `${reply.slice(0, 1597)}...` : reply;
    res.message(truncated);

    return new NextResponse(res.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  } catch (err) {
    logError("Twilio SMS Rico invocation failed", err, { from: from.slice(-4) });
    const res = new MessagingResponse();
    res.message("Reco is taking a breather. Try again in a moment.");
    return new NextResponse(res.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  }
}
