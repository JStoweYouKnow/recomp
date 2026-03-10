import { NextRequest, NextResponse } from "next/server";
import { dbVerifyAccount } from "@/lib/db";
import { buildSetCookieHeader } from "@/lib/auth";
import { logInfo, logError } from "@/lib/logger";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";

const LoginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
});

export async function POST(req: NextRequest) {
    try {
        const ip = getRequestIp(req);
        const rlKey = getClientKey(ip, "login");
        const { ok, remaining, resetAt } = await fixedWindowRateLimit(rlKey, 10, 60000);
        if (!ok) {
            logInfo("RATE_LIMIT_EXCEEDED", { route: "auth/login", ip });
            return NextResponse.json({ error: "Too many requests" }, { status: 429 });
        }

        const body = await req.json();
        const parsed = LoginSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: "Invalid input", details: parsed.error.format() }, { status: 400 });
        }

        const { email, password } = parsed.data;

        const account = await dbVerifyAccount(email);
        if (!account) {
            return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
        }

        const passwordMatch = await bcrypt.compare(password, account.passwordHash);
        if (!passwordMatch) {
            return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
        }

        logInfo("USER_LOGGED_IN", { route: "auth/login", userId: account.userId });

        const cookieHeader = buildSetCookieHeader(account.userId);
        const response = NextResponse.json({ success: true, userId: account.userId });
        response.headers.set("Set-Cookie", cookieHeader);

        return response;
    } catch (error) {
        logError("Failed to login", error, { route: "auth/login" });
        return NextResponse.json({ error: "Failed to login" }, { status: 500 });
    }
}
