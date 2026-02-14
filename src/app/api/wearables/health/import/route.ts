import { NextRequest, NextResponse } from "next/server";

/** Import Apple Health, Health Connect, or Garmin export data.
 * Accepts JSON in common formats (steps, sleep, workouts, heart rate).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const summaries: Array<{
      date: string;
      provider: "apple" | "android" | "garmin";
      steps?: number;
      caloriesBurned?: number;
      activeMinutes?: number;
      sleepDuration?: number;
      heartRateAvg?: number;
      workouts?: { name: string; duration: number; calories?: number }[];
    }> = [];

    const byDate = new Map<string, Record<string, unknown>>();

    if (Array.isArray(body)) {
      body.forEach((row: Record<string, unknown>) => {
        const date = (row.date ?? row.startDate ?? row.timestamp) as string;
        const d = (typeof date === "string" ? date : new Date(date as number).toISOString()).slice(0, 10);
        const existing = byDate.get(d) ?? { date: d, provider: row.provider ?? "apple" };
        if (row.steps) existing.steps = (existing.steps as number ?? 0) + (row.steps as number);
        if (row.calories) existing.caloriesBurned = (existing.caloriesBurned as number ?? 0) + (row.calories as number);
        if (row.activeMinutes) existing.activeMinutes = (existing.activeMinutes as number ?? 0) + (row.activeMinutes as number);
        if (row.sleepDuration) existing.sleepDuration = row.sleepDuration as number;
        if (row.heartRate) existing.heartRateAvg = row.heartRate as number;
        if (row.workouts) existing.workouts = row.workouts as { name: string; duration: number; calories?: number }[];
        byDate.set(d, existing);
      });
    } else if (typeof body === "object") {
      const samples = body.data ?? body.healthData ?? body.samples ?? body.records ?? [body];
      samples.forEach((row: Record<string, unknown>) => {
        const date = (row.date ?? row.startDate ?? row.endDate ?? row.timestamp) as string;
        const d = (typeof date === "string" ? date : new Date(date as number).toISOString()).slice(0, 10);
        const existing = (byDate.get(d) ?? { date: d, provider: body.provider ?? "apple" }) as Record<string, unknown>;
        const type = (row.type ?? row.dataType ?? row.quantityType) as string;
        const val = (row.value ?? row.quantity ?? row.count) as number;
        if (type?.toLowerCase().includes("step") || "steps" in row) existing.steps = ((existing.steps as number) ?? 0) + (val ?? (row.steps as number) ?? 0);
        if (type?.toLowerCase().includes("calorie") || "calories" in row) existing.caloriesBurned = ((existing.caloriesBurned as number) ?? 0) + (val ?? (row.calories as number) ?? 0);
        if (type?.toLowerCase().includes("sleep") || "sleep" in row) existing.sleepDuration = val ?? (row.sleepDuration as number) ?? (row.duration as number);
        if (type?.toLowerCase().includes("heart") || "heartRate" in row) existing.heartRateAvg = val ?? (row.heartRate as number);
        byDate.set(d, existing);
      });
    }

    byDate.forEach((v) => {
      summaries.push({
        date: v.date as string,
        provider: (v.provider as "apple" | "android" | "garmin") ?? "apple",
        steps: v.steps as number | undefined,
        caloriesBurned: v.caloriesBurned as number | undefined,
        activeMinutes: v.activeMinutes as number | undefined,
        sleepDuration: v.sleepDuration as number | undefined,
        heartRateAvg: v.heartRateAvg as number | undefined,
        workouts: v.workouts as { name: string; duration: number; calories?: number }[] | undefined,
      });
    });

    return NextResponse.json({ data: summaries, count: summaries.length });
  } catch (err) {
    console.error("Health import error:", err);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
