import { NextRequest, NextResponse } from "next/server";

const KG_TO_LBS = 2.2046226218;

type ScaleRow = {
  date: string;
  weight?: number;
  bodyFatPercent?: number;
  muscleMass?: number;
  bmi?: number;
  skeletalMusclePercent?: number;
  fatFreeMass?: number;
  subcutaneousFatPercent?: number;
  visceralFat?: number;
  bodyWaterPercent?: number;
  boneMass?: number;
  proteinPercent?: number;
  bmr?: number;
  metabolicAge?: number;
};

/** Parse Renpho (and similar) scale CSV export.
 * Renpho: Device > History > Export data. Handles RENPHO columns: Weight(lb), BMI, Body Fat(%), Skeletal Muscle(%), Fat-Free Mass(lb), Subcutaneous Fat(%), Visceral Fat, Body Water(%), Muscle Mass(lb), Bone Mass(lb), Protein (%), BMR(kcal), Metabolic Age. */
function parseScaleCsv(csvText: string): ScaleRow[] {
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
  const dateIdx = idx("date") >= 0 ? idx("date") : idx(/^time|record/);
  const weightIdx = headers.findIndex((c) => c.includes("weight") && (c.includes("lb") || c.includes("pound"))) >= 0
    ? headers.findIndex((c) => c.includes("weight") && (c.includes("lb") || c.includes("pound")))
    : idx("weight") >= 0 ? idx("weight") : idx(/mass|lb|kg/);
  const bmiIdx = idx("bmi");
  const fatIdx = idx("body fat") >= 0 ? idx("body fat") : idx(/fat%|fat %|bodyfat/);
  const skeletalIdx = idx("skeletal muscle") >= 0 ? idx("skeletal muscle") : headers.findIndex((c) => c.includes("skeletal"));
  const fatFreeIdx = headers.findIndex((c) => (c.includes("fat-free") || c.includes("fat free")) && c.includes("mass"));
  const subqIdx = idx("subcutaneous");
  const visceralIdx = idx("visceral");
  const waterIdx = idx("body water") >= 0 ? idx("body water") : headers.findIndex((c) => c.includes("water"));
  const muscleIdx = headers.findIndex((c) => c.includes("muscle mass") && (c.includes("lb") || c.includes("pound"))) >= 0
    ? headers.findIndex((c) => c.includes("muscle mass") && (c.includes("lb") || c.includes("pound")))
    : idx("muscle mass") >= 0 ? idx("muscle mass") : idx("muscle");
  const boneIdx = idx("bone mass");
  const proteinIdx = idx("protein");
  const bmrIdx = idx("bmr");
  const metabolicIdx = idx("metabolic age");
  const weightIsLbs = weightIdx >= 0 && (headers[weightIdx]?.includes("lb") || headers[weightIdx]?.includes("pound"));
  const muscleIsLbs = muscleIdx >= 0 && (headers[muscleIdx]?.includes("lb") || headers[muscleIdx]?.includes("pound"));
  const fatFreeIsLbs = fatFreeIdx >= 0 && (headers[fatFreeIdx]?.includes("lb") || headers[fatFreeIdx]?.includes("pound"));
  const boneIsLbs = boneIdx >= 0 && (headers[boneIdx]?.includes("lb") || headers[boneIdx]?.includes("pound"));
  if (dateIdx < 0 && weightIdx < 0) return [];

  const result: ScaleRow[] = [];
  for (const line of rows) {
    const cells = line.split(/[,\t]/).map((c) => c.trim().replace(/^--\s*$/, ""));
    const dateVal = dateIdx >= 0 ? cells[dateIdx] : "";
    const dateStr = dateVal ? new Date(dateVal).toISOString().slice(0, 10) : "";
    if (!dateStr) continue;
    const num = (i: number) => (i >= 0 ? parseFloat(cells[i]) : NaN);
    const weightVal = num(weightIdx);
    const weight = Number.isFinite(weightVal) ? (weightIsLbs ? weightVal : weightVal * KG_TO_LBS) : undefined;
    const bodyFatPercent = Number.isFinite(num(fatIdx)) && num(fatIdx) >= 0 && num(fatIdx) <= 100 ? num(fatIdx) : undefined;
    const muscleVal = num(muscleIdx);
    const muscleMass = Number.isFinite(muscleVal) && muscleVal >= 0 ? (muscleIsLbs ? muscleVal : muscleVal * KG_TO_LBS) : undefined;
    const bmi = Number.isFinite(num(bmiIdx)) && num(bmiIdx) >= 10 && num(bmiIdx) <= 60 ? num(bmiIdx) : undefined;
    const skeletalMusclePercent = Number.isFinite(num(skeletalIdx)) && num(skeletalIdx) >= 0 && num(skeletalIdx) <= 100 ? num(skeletalIdx) : undefined;
    const fatFreeVal = num(fatFreeIdx);
    const fatFreeMass = Number.isFinite(fatFreeVal) && fatFreeVal >= 0 ? (fatFreeIsLbs ? fatFreeVal : fatFreeVal * KG_TO_LBS) : undefined;
    const subcutaneousFatPercent = Number.isFinite(num(subqIdx)) && num(subqIdx) >= 0 && num(subqIdx) <= 100 ? num(subqIdx) : undefined;
    const visceralFat = Number.isFinite(num(visceralIdx)) && num(visceralIdx) >= 0 && num(visceralIdx) <= 30 ? num(visceralIdx) : undefined;
    const bodyWaterPercent = Number.isFinite(num(waterIdx)) && num(waterIdx) >= 0 && num(waterIdx) <= 100 ? num(waterIdx) : undefined;
    const boneVal = num(boneIdx);
    const boneMass = Number.isFinite(boneVal) && boneVal >= 0 ? (boneIsLbs ? boneVal : boneVal * KG_TO_LBS) : undefined;
    const proteinPercent = Number.isFinite(num(proteinIdx)) && num(proteinIdx) >= 0 && num(proteinIdx) <= 100 ? num(proteinIdx) : undefined;
    const bmr = Number.isFinite(num(bmrIdx)) && num(bmrIdx) >= 500 && num(bmrIdx) <= 5000 ? num(bmrIdx) : undefined;
    const metabolicAge = Number.isFinite(num(metabolicIdx)) && num(metabolicIdx) >= 10 && num(metabolicIdx) <= 100 ? num(metabolicIdx) : undefined;
    result.push({
      date: dateStr,
      ...(weight != null && { weight }),
      ...(bodyFatPercent != null && { bodyFatPercent }),
      ...(muscleMass != null && { muscleMass }),
      ...(bmi != null && { bmi }),
      ...(skeletalMusclePercent != null && { skeletalMusclePercent }),
      ...(fatFreeMass != null && { fatFreeMass }),
      ...(subcutaneousFatPercent != null && { subcutaneousFatPercent }),
      ...(visceralFat != null && { visceralFat }),
      ...(bodyWaterPercent != null && { bodyWaterPercent }),
      ...(boneMass != null && { boneMass }),
      ...(proteinPercent != null && { proteinPercent }),
      ...(bmr != null && { bmr }),
      ...(metabolicAge != null && { metabolicAge }),
    });
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
        const existing = (byDate.get(row.date) ?? { date: row.date, provider: "scale" as const }) as Record<string, unknown>;
        if (row.weight != null) existing.weight = row.weight;
        if (row.bodyFatPercent != null) existing.bodyFatPercent = row.bodyFatPercent;
        if (row.muscleMass != null) existing.muscleMass = row.muscleMass;
        if (row.bmi != null) existing.bmi = row.bmi;
        if (row.skeletalMusclePercent != null) existing.skeletalMusclePercent = row.skeletalMusclePercent;
        if (row.fatFreeMass != null) existing.fatFreeMass = row.fatFreeMass;
        if (row.subcutaneousFatPercent != null) existing.subcutaneousFatPercent = row.subcutaneousFatPercent;
        if (row.visceralFat != null) existing.visceralFat = row.visceralFat;
        if (row.bodyWaterPercent != null) existing.bodyWaterPercent = row.bodyWaterPercent;
        if (row.boneMass != null) existing.boneMass = row.boneMass;
        if (row.proteinPercent != null) existing.proteinPercent = row.proteinPercent;
        if (row.bmr != null) existing.bmr = row.bmr;
        if (row.metabolicAge != null) existing.metabolicAge = row.metabolicAge;
        byDate.set(row.date, existing);
      });
    } else if (Array.isArray(body)) {
      const toLbs = (w: number, prov: string) => (prov === "apple" || prov === "android" ? w * KG_TO_LBS : w);
      body.forEach((row: Record<string, unknown>) => {
        const date = (row.date ?? row.startDate ?? row.timestamp) as string;
        const d = (typeof date === "string" ? date : new Date(date as number).toISOString()).slice(0, 10);
        const prov = String(row.provider ?? "apple");
        const existing = byDate.get(d) ?? { date: d, provider: row.provider ?? "apple" };
        if (row.steps) existing.steps = (existing.steps as number ?? 0) + (row.steps as number);
        if (row.calories) existing.caloriesBurned = (existing.caloriesBurned as number ?? 0) + (row.calories as number);
        if (row.activeMinutes) existing.activeMinutes = (existing.activeMinutes as number ?? 0) + (row.activeMinutes as number);
        if (row.sleepDuration) existing.sleepDuration = row.sleepDuration as number;
        if (row.heartRate) existing.heartRateAvg = row.heartRate as number;
        if (row.weight != null) (existing as Record<string, unknown>).weight = toLbs(row.weight as number, prov);
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
        if (type?.toLowerCase().includes("weight") || type?.toLowerCase().includes("bodymass") || "weight" in row) {
          const w = val ?? (row.weight as number);
          if (w != null) existing.weight = (body.provider === "apple" || body.provider === "android" ? w * KG_TO_LBS : w);
        }
        if (type?.toLowerCase().includes("bodyfat") || type?.toLowerCase().includes("fat%") || "bodyFatPercent" in row) existing.bodyFatPercent = val ?? (row.bodyFatPercent as number);
        byDate.set(d, existing);
      });
    }

    const summaries: Array<Record<string, unknown>> = [];
    byDate.forEach((v) => {
      summaries.push({
        date: v.date,
        provider: v.provider ?? (v.weight != null ? "scale" : "apple"),
        steps: v.steps,
        caloriesBurned: v.caloriesBurned,
        activeMinutes: v.activeMinutes,
        sleepDuration: v.sleepDuration,
        heartRateAvg: v.heartRateAvg,
        weight: v.weight,
        bodyFatPercent: v.bodyFatPercent,
        muscleMass: v.muscleMass,
        bmi: v.bmi,
        skeletalMusclePercent: v.skeletalMusclePercent,
        fatFreeMass: v.fatFreeMass,
        subcutaneousFatPercent: v.subcutaneousFatPercent,
        visceralFat: v.visceralFat,
        bodyWaterPercent: v.bodyWaterPercent,
        boneMass: v.boneMass,
        proteinPercent: v.proteinPercent,
        bmr: v.bmr,
        metabolicAge: v.metabolicAge,
        workouts: v.workouts,
      });
    });

    return NextResponse.json({ data: summaries, count: summaries.length });
  } catch (err) {
    console.error("Health import error:", err);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
