import { NextRequest, NextResponse } from "next/server";

/** Parse Renpho (and similar) scale CSV export.
 * Renpho: Device > History > Export data. Handles common column names. */
function parseScaleCsv(csvText: string): Array<{ date: string; weight?: number; bodyFatPercent?: number; muscleMass?: number }> {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].toLowerCase();
  const rows = lines.slice(1);
  const idx = (name: string | RegExp) => {
    const h = header.split(/[,\t]/).map((c) => c.trim().toLowerCase());
    if (typeof name === "string") return h.findIndex((c) => c.includes(name));
    return h.findIndex((c) => name.test(c));
  };
  const headers = header.split(/[,\t]/).map((c) => c.trim().toLowerCase());
  const dateIdx = idx("date") >= 0 ? idx("date") : idx(/time|record/);
  const weightIdx = idx("weight") >= 0 ? idx("weight") : idx(/mass|lb|kg/);
  const fatIdx = idx("body fat") >= 0 ? idx("body fat") : idx(/fat%|fat %|bodyfat/);
  const muscleIdx = idx("muscle") >= 0 ? idx("muscle") : idx(/skeletal muscle|muscle mass/);
  const weightIsLbs = weightIdx >= 0 && (headers[weightIdx]?.includes("lb") || headers[weightIdx]?.includes("pound"));
  const muscleIsLbs = muscleIdx >= 0 && (headers[muscleIdx]?.includes("lb") || headers[muscleIdx]?.includes("pound"));
  if (dateIdx < 0 && weightIdx < 0) return [];

  const result: Array<{ date: string; weight?: number; bodyFatPercent?: number; muscleMass?: number }> = [];
  for (const line of rows) {
    const cells = line.split(/[,\t]/).map((c) => c.trim());
    const dateVal = dateIdx >= 0 ? cells[dateIdx] : "";
    const dateStr = dateVal ? new Date(dateVal).toISOString().slice(0, 10) : "";
    if (!dateStr) continue;
    const weightVal = weightIdx >= 0 ? parseFloat(cells[weightIdx]) : NaN;
    const fatVal = fatIdx >= 0 ? parseFloat(cells[fatIdx]) : NaN;
    const muscleVal = muscleIdx >= 0 ? parseFloat(cells[muscleIdx]) : NaN;
    const rawWeight = Number.isFinite(weightVal) ? weightVal : undefined;
    const weight = rawWeight != null ? (weightIsLbs ? rawWeight * 0.453592 : rawWeight) : undefined;
    const bodyFatPercent = Number.isFinite(fatVal) && fatVal >= 0 && fatVal <= 100 ? fatVal : undefined;
    const rawMuscle = Number.isFinite(muscleVal) ? muscleVal : undefined;
    const muscleMass = rawMuscle != null ? (muscleIsLbs ? rawMuscle * 0.453592 : rawMuscle) : undefined;
    result.push({ date: dateStr, ...(weight != null && { weight }), ...(bodyFatPercent != null && { bodyFatPercent }), ...(muscleMass != null && muscleMass >= 0 && { muscleMass }) });
  }
  return result;
}

/** Import Apple Health, Health Connect, Garmin, or Renpho CSV.
 * Accepts JSON or { csv: "..." } for Renpho export.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const byDate = new Map<string, Record<string, unknown>>();

    if (typeof body === "object" && typeof body.csv === "string") {
      const scaleRows = parseScaleCsv(body.csv);
      scaleRows.forEach((row) => {
        const existing = byDate.get(row.date) ?? { date: row.date, provider: "scale" as const };
        if (row.weight != null) (existing as Record<string, unknown>).weight = row.weight;
        if (row.bodyFatPercent != null) (existing as Record<string, unknown>).bodyFatPercent = row.bodyFatPercent;
        if (row.muscleMass != null) (existing as Record<string, unknown>).muscleMass = row.muscleMass;
        byDate.set(row.date, existing);
      });
    } else if (Array.isArray(body)) {
      body.forEach((row: Record<string, unknown>) => {
        const date = (row.date ?? row.startDate ?? row.timestamp) as string;
        const d = (typeof date === "string" ? date : new Date(date as number).toISOString()).slice(0, 10);
        const existing = byDate.get(d) ?? { date: d, provider: row.provider ?? "apple" };
        if (row.steps) existing.steps = (existing.steps as number ?? 0) + (row.steps as number);
        if (row.calories) existing.caloriesBurned = (existing.caloriesBurned as number ?? 0) + (row.calories as number);
        if (row.activeMinutes) existing.activeMinutes = (existing.activeMinutes as number ?? 0) + (row.activeMinutes as number);
        if (row.sleepDuration) existing.sleepDuration = row.sleepDuration as number;
        if (row.heartRate) existing.heartRateAvg = row.heartRate as number;
        if (row.weight != null) existing.weight = row.weight as number;
        if (row.bodyFatPercent != null) existing.bodyFatPercent = row.bodyFatPercent as number;
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
        if (type?.toLowerCase().includes("weight") || type?.toLowerCase().includes("bodymass") || "weight" in row) existing.weight = val ?? (row.weight as number);
        if (type?.toLowerCase().includes("bodyfat") || type?.toLowerCase().includes("fat%") || "bodyFatPercent" in row) existing.bodyFatPercent = val ?? (row.bodyFatPercent as number);
        byDate.set(d, existing);
      });
    }

    const summaries: Array<{
      date: string;
      provider: "apple" | "android" | "garmin" | "scale";
      steps?: number;
      caloriesBurned?: number;
      activeMinutes?: number;
      sleepDuration?: number;
      heartRateAvg?: number;
      weight?: number;
      bodyFatPercent?: number;
      muscleMass?: number;
      workouts?: { name: string; duration: number; calories?: number }[];
    }> = [];
    byDate.forEach((v) => {
      summaries.push({
        date: v.date as string,
        provider: (v.provider as "apple" | "android" | "garmin" | "scale") ?? (v.weight != null ? "scale" : "apple"),
        steps: v.steps as number | undefined,
        caloriesBurned: v.caloriesBurned as number | undefined,
        activeMinutes: v.activeMinutes as number | undefined,
        sleepDuration: v.sleepDuration as number | undefined,
        heartRateAvg: v.heartRateAvg as number | undefined,
        weight: v.weight as number | undefined,
        bodyFatPercent: v.bodyFatPercent as number | undefined,
        muscleMass: v.muscleMass as number | undefined,
        workouts: v.workouts as { name: string; duration: number; calories?: number }[] | undefined,
      });
    });

    return NextResponse.json({ data: summaries, count: summaries.length });
  } catch (err) {
    console.error("Health import error:", err);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
