import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { dbCreatePasswordResetToken, dbVerifyAccount } from "@/lib/db";
import { logInfo, logError } from "@/lib/logger";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";

const Schema = z.object({ email: z.string().email() });

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM_EMAIL ?? "Refactor <noreply@refactoryourbody.com>";

export async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "forgot-password"), 3, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  try {
    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid email" }, { status: 400 });

    const { email } = parsed.data;

    // Always respond 200 — don't leak whether the email exists.
    const account = await dbVerifyAccount(email);
    if (!account) {
      logInfo("forgot-password: unknown email (suppressed)", { route: "auth/forgot-password" });
      return NextResponse.json({ ok: true });
    }

    const code = await dbCreatePasswordResetToken(email);

    await resend.emails.send({
      from: FROM,
      to: email,
      subject: "Reset your Refactor password",
      html: `
        <div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:32px 24px">
          <h2 style="margin-top:0">Reset your password</h2>
          <p>Enter this code in the Refactor app. It expires in 15 minutes.</p>
          <div style="font-size:36px;font-weight:bold;letter-spacing:8px;text-align:center;padding:24px 0;color:#4a6741">
            ${code}
          </div>
          <p style="color:#888;font-size:13px">If you didn't request this, you can ignore this email — your password won't change.</p>
        </div>
      `,
    });

    logInfo("forgot-password: OTP sent", { route: "auth/forgot-password" });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logError("forgot-password failed", err, { route: "auth/forgot-password" });
    return NextResponse.json({ error: "Failed to send reset email" }, { status: 500 });
  }
}
