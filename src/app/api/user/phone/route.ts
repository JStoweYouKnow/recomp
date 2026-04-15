import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { dbLinkPhone, dbUnlinkPhone, dbGetUserPhone } from "@/lib/db";

/** GET: Return linked phone (masked). */
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    const phone = await dbGetUserPhone(userId);
    if (!phone) return NextResponse.json({ linked: false });
    const masked = phone.length >= 4 ? `***-***-${phone.slice(-4)}` : "***";
    return NextResponse.json({ linked: true, masked, full: phone });
  } catch (err) {
    console.error("Get phone error:", err);
    return NextResponse.json({ error: "Could not fetch phone" }, { status: 500 });
  }
}

/** POST: Link phone. Body: { phone: "+15551234567" } */
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    const { phone } = await req.json();
    const raw = typeof phone === "string" ? phone.trim() : "";
    if (!raw) return NextResponse.json({ error: "phone required" }, { status: 400 });

    await dbLinkPhone(userId, raw);
    const masked = raw.replace(/\d(?=\d{4})/g, "*");
    return NextResponse.json({ linked: true, masked });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not link phone";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

/** DELETE: Unlink phone. */
export async function DELETE() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    await dbUnlinkPhone(userId);
    return NextResponse.json({ linked: false });
  } catch (err) {
    console.error("Unlink phone error:", err);
    return NextResponse.json({ error: "Could not unlink phone" }, { status: 500 });
  }
}
