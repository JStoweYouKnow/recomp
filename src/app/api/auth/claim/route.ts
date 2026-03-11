import { NextRequest, NextResponse } from "next/server";
import { dbCreateAccount, dbGetProfile, dbSaveProfile } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { logInfo, logError } from "@/lib/logger";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";

const ClaimSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
});

export async function POST(req: NextRequest) {
    try {
        const ip = getRequestIp(req);
        const rlKey = getClientKey(ip, "claim");
        const { ok, remaining, resetAt } = await fixedWindowRateLimit(rlKey, 5, 60000);
        if (!ok) {
            logInfo("RATE_LIMIT_EXCEEDED", { route: "auth/claim", ip });
            return NextResponse.json({ error: "Too many requests" }, { status: 429 });
        }

        const userId = await getUserId(req.headers);
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const parsed = ClaimSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: "Invalid input", details: parsed.error.format() }, { status: 400 });
        }

        const { email, password } = parsed.data;
        const passwordHash = await bcrypt.hash(password, 10);

        const accountCreated = await dbCreateAccount({
            userId,
            email,
            passwordHash,
            createdAt: new Date().toISOString()
        });

        if (!accountCreated) {
            return NextResponse.json({ error: "Email already in use" }, { status: 409 });
        }

        // Try to update the profile with the email
        try {
            const profile = await dbGetProfile(userId);
            if (profile) {
                profile.email = email;
                await dbSaveProfile(userId, profile);
            }
        } catch (e) {
            logError("Failed to update profile", e, { route: "auth/claim" });
            // it's fine if this fails, the account is still claimed for login purposes
        }

        logInfo("USER_CLAIMED_ACCOUNT", { route: "auth/claim", userId });

        return NextResponse.json({ success: true, userId });
    } catch (error) {
        logError("Failed to claim account", error, { route: "auth/claim" });
        return NextResponse.json({ error: "Failed to claim account" }, { status: 500 });
    }
}
