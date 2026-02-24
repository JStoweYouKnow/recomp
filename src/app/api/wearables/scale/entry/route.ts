import { NextRequest, NextResponse } from "next/server";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";

/** Manual weight entry — for scales without app sync or quick logging.
 * Accepts { date, weightKg, bodyFatPercent? }. Returns a WearableDaySummary suitable for onDataFetched. */
export async function POST(req: NextRequest) {
  const rl = fixedWindowRateLimit(getClientKey(getRequestIp(req), "scale-entry"), 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  try {
    const body = await req.json();
    const date = (body.date as string)?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
    const weightKg = typeof body.weightKg === "number" ? body.weightKg : parseFloat(body.weightKg);
    const bodyFatPercent = body.bodyFatPercent != null ? Number(body.bodyFatPercent) : undefined;

    if (!Number.isFinite(weightKg) || weightKg < 20 || weightKg > 500) {
      return NextResponse.json({ error: "Invalid weight (use kg, 20–500)" }, { status: 400 });
    }

    const summary: { date: string; provider: "scale"; weight: number; bodyFatPercent?: number } = {
      date,
      provider: "scale",
      weight: weightKg,
    };
    if (typeof bodyFatPercent === "number" && bodyFatPercent >= 0 && bodyFatPercent <= 100) {
      summary.bodyFatPercent = bodyFatPercent;
    }

    return NextResponse.json({ data: [summary], count: 1 });
  } catch (err) {
    console.error("Scale entry error:", err);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
