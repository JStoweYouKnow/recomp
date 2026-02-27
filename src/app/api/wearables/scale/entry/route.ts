import { NextRequest, NextResponse } from "next/server";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";

/** Manual weight entry — for scales without app sync or quick logging.
 * Accepts { date, weightLbs, bodyFatPercent? } (all weights in lbs). Returns a WearableDaySummary suitable for onDataFetched. */
export async function POST(req: NextRequest) {
  const rl = fixedWindowRateLimit(getClientKey(getRequestIp(req), "scale-entry"), 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  try {
    const body = await req.json();
    const date = (body.date as string)?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
    const weightLbs = typeof body.weightLbs === "number" ? body.weightLbs : parseFloat(body.weightLbs);
    const bodyFatPercent = body.bodyFatPercent != null ? Number(body.bodyFatPercent) : undefined;
    const muscleMass = body.muscleMass != null ? Number(body.muscleMass) : undefined;
    const opt = (k: string, min: number, max: number) => {
      const v = body[k];
      if (v == null) return undefined;
      const n = Number(v);
      return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
    };

    if (!Number.isFinite(weightLbs) || weightLbs < 44 || weightLbs > 1100) {
      return NextResponse.json({ error: "Invalid weight (44–1100 lbs)" }, { status: 400 });
    }

    const summary: Record<string, unknown> = {
      date,
      provider: "scale",
      weight: weightLbs,
    };
    if (typeof bodyFatPercent === "number" && bodyFatPercent >= 0 && bodyFatPercent <= 100) {
      summary.bodyFatPercent = bodyFatPercent;
    }
    if (typeof muscleMass === "number" && muscleMass >= 0 && muscleMass <= 500) {
      summary.muscleMass = muscleMass;
    }
    const bmi = opt("bmi", 10, 60);
    if (bmi != null) summary.bmi = bmi;
    const skeletalMusclePercent = opt("skeletalMusclePercent", 0, 100);
    if (skeletalMusclePercent != null) summary.skeletalMusclePercent = skeletalMusclePercent;
    const fatFreeMass = body.fatFreeMass != null ? Number(body.fatFreeMass) : undefined;
    if (typeof fatFreeMass === "number" && fatFreeMass >= 0 && fatFreeMass <= 500) summary.fatFreeMass = fatFreeMass;
    const subcutaneousFatPercent = opt("subcutaneousFatPercent", 0, 100);
    if (subcutaneousFatPercent != null) summary.subcutaneousFatPercent = subcutaneousFatPercent;
    const visceralFat = opt("visceralFat", 0, 30);
    if (visceralFat != null) summary.visceralFat = visceralFat;
    const bodyWaterPercent = opt("bodyWaterPercent", 0, 100);
    if (bodyWaterPercent != null) summary.bodyWaterPercent = bodyWaterPercent;
    const boneMass = body.boneMass != null ? Number(body.boneMass) : undefined;
    if (typeof boneMass === "number" && boneMass >= 0 && boneMass <= 110) summary.boneMass = boneMass;
    const proteinPercent = opt("proteinPercent", 0, 100);
    if (proteinPercent != null) summary.proteinPercent = proteinPercent;
    const bmr = opt("bmr", 500, 5000);
    if (bmr != null) summary.bmr = bmr;
    const metabolicAge = opt("metabolicAge", 10, 100);
    if (metabolicAge != null) summary.metabolicAge = metabolicAge;

    return NextResponse.json({ data: [summary], count: 1 });
  } catch (err) {
    console.error("Scale entry error:", err);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
