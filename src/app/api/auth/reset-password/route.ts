import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import {
  dbVerifyPasswordResetToken,
  dbDeletePasswordResetToken,
  dbUpdatePasswordHash,
} from "@/lib/db";
import { logInfo, logError } from "@/lib/logger";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";

const Schema = z.object({
  email: z.string().email(),
  code: z.string().length(6).regex(/^\d{6}$/),
  newPassword: z.string().min(8),
});

export async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "reset-password"), 5, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  try {
    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    const { email, code, newPassword } = parsed.data;

    const valid = await dbVerifyPasswordResetToken(email, code);
    if (!valid) return NextResponse.json({ error: "Invalid or expired code" }, { status: 400 });

    const newHash = await bcrypt.hash(newPassword, 10);
    const updated = await dbUpdatePasswordHash(email, newHash);
    if (!updated) return NextResponse.json({ error: "Account not found" }, { status: 404 });

    await dbDeletePasswordResetToken(email);

    logInfo("reset-password: password updated", { route: "auth/reset-password" });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logError("reset-password failed", err, { route: "auth/reset-password" });
    return NextResponse.json({ error: "Failed to reset password" }, { status: 500 });
  }
}
