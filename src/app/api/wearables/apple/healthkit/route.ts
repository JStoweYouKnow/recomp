import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";

type WearableSummary = {
  date: string;
  provider: "apple";
  steps?: number;
  caloriesBurned?: number;
  activeMinutes?: number;
  sleepDuration?: number;
  heartRateAvg?: number;
  workouts?: { name: string; duration: number; calories?: number }[];
  weight?: number;
  bodyFatPercent?: number;
};

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function toDateKey(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length >= 10) return trimmed.slice(0, 10);
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString().slice(0, 10);
  }
  return null;
}

function inferDate(sample: Record<string, unknown>): string | null {
  return (
    toDateKey(sample.date) ??
    toDateKey(sample.startDate) ??
    toDateKey(sample.endDate) ??
    toDateKey(sample.timestamp)
  );
}

function normalizeAppleSamples(payload: unknown): WearableSummary[] {
  const root = typeof payload === "object" && payload ? (payload as Record<string, unknown>) : {};
  const rawSamples = Array.isArray(payload)
    ? payload
    : Array.isArray(root.samples)
      ? root.samples
      : Array.isArray(root.data)
        ? root.data
        : [];

  const days = new Map<string, WearableSummary>();

  for (const raw of rawSamples) {
    if (!raw || typeof raw !== "object") continue;
    const sample = raw as Record<string, unknown>;
    const dayKey = inferDate(sample);
    if (!dayKey) continue;

    const existing = days.get(dayKey) ?? { date: dayKey, provider: "apple" as const };
    const type =
      String(
        sample.type ??
          sample.quantityTypeIdentifier ??
          sample.categoryTypeIdentifier ??
          sample.dataType ??
          ""
      ).toLowerCase();
    const value = toNumber(sample.value ?? sample.quantity ?? sample.count);

    if (type.includes("step")) {
      const steps = value ?? toNumber(sample.steps);
      if (steps != null) existing.steps = (existing.steps ?? 0) + steps;
    }
    if (type.includes("active") || type.includes("exercise")) {
      const activeMinutes = value ?? toNumber(sample.activeMinutes ?? sample.durationMinutes);
      if (activeMinutes != null) existing.activeMinutes = (existing.activeMinutes ?? 0) + activeMinutes;
    }
    if (type.includes("calorie") || type.includes("energy")) {
      const calories = value ?? toNumber(sample.calories ?? sample.caloriesBurned);
      if (calories != null) existing.caloriesBurned = (existing.caloriesBurned ?? 0) + calories;
    }
    if (type.includes("sleep")) {
      const sleep = value ?? toNumber(sample.sleepDuration ?? sample.duration);
      if (sleep != null) existing.sleepDuration = sleep;
    }
    if (type.includes("heart")) {
      const hr = value ?? toNumber(sample.heartRate ?? sample.heartRateAvg);
      if (hr != null) existing.heartRateAvg = hr;
    }
    if (type.includes("weight") || type.includes("bodymass") || type === "kg") {
      const w = value ?? toNumber(sample.weight);
      if (w != null) existing.weight = w; // Apple Health uses kg for HKQuantityTypeIdentifierBodyMass
    }
    if (type.includes("fat") || type.includes("bodyfat")) {
      const bf = value ?? toNumber(sample.bodyFatPercent ?? sample.bodyFat);
      if (bf != null) existing.bodyFatPercent = bf;
    }

    if (Array.isArray(sample.workouts)) {
      existing.workouts = sample.workouts as { name: string; duration: number; calories?: number }[];
    }

    days.set(dayKey, existing);
  }

  return Array.from(days.values());
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const configuredKey = process.env.APPLE_HEALTH_INGEST_KEY;
  if (configuredKey) {
    const key = req.headers.get("x-apple-health-key");
    if (key !== configuredKey) {
      return NextResponse.json({ error: "Invalid Apple Health ingest key" }, { status: 401 });
    }
  }

  try {
    const payload = await req.json();
    const data = normalizeAppleSamples(payload);
    if (data.length === 0) {
      return NextResponse.json({ error: "No Apple Health samples found" }, { status: 400 });
    }
    return NextResponse.json({ data, provider: "apple", count: data.length });
  } catch (err) {
    console.error("Apple HealthKit ingest error:", err);
    return NextResponse.json({ error: "Apple Health ingest failed" }, { status: 500 });
  }
}
