import { logInfo } from "@/lib/logger";
import type { UserProfile, WearableDaySummary } from "@/lib/types";

/** Optional client hints; stripped before persistence. */
export type WearableInbound = WearableDaySummary & {
  weightUnit?: "lbs" | "kg";
  muscleMassUnit?: "lbs" | "kg";
};

const LB_PER_KG = 2.2046226218;

function stripInboundUnitFields(row: WearableInbound): WearableInbound {
  const copy = { ...row };
  delete copy.weightUnit;
  delete copy.muscleMassUnit;
  return copy;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Native clients send **inches** when `unitSystem` is `us`, and **cm** when `metric`
 * (see Swift `SignUpFormView` + web usage). Convert to inches for BMI.
 */
export function profileHeightInches(profile: UserProfile | undefined): number | undefined {
  if (!profile?.height || !Number.isFinite(profile.height) || profile.height <= 0) {
    return undefined;
  }
  if (profile.unitSystem === "metric") {
    return profile.height / 2.54;
  }
  // US stores inches (typical adult 54–84). Larger values likely cm mis-tagged as us.
  if (profile.height > 96) {
    return profile.height / 2.54;
  }
  return profile.height;
}

/** BMI from weight (lbs) and height (in). */
export function bmiFromWeightLbsHeightIn(weightLbs: number, heightIn: number): number {
  return (703 * weightLbs) / (heightIn * heightIn);
}

/**
 * Reconcile scale-reported BMI with weight + profile height when they disagree materially.
 */
function reconcileBmi(
  summary: WearableDaySummary,
  weightLbs: number | undefined,
  profile?: UserProfile
): void {
  if (weightLbs === undefined || weightLbs < 44) return;
  const heightIn = profileHeightInches(profile);
  if (heightIn === undefined || heightIn < 48 || heightIn > 96) return;

  const expected = bmiFromWeightLbsHeightIn(weightLbs, heightIn);

  if (summary.bmi == null || !Number.isFinite(summary.bmi)) {
    return;
  }

  const delta = Math.abs(summary.bmi - expected);
  const tolerate = Math.max(4, Math.abs(expected) * 0.16);
  if (delta <= tolerate) return;

  logInfo("wearable-bmi-reconcile", {
    date: summary.date,
    provider: summary.provider,
    reportedBmi: summary.bmi,
    computedBmi: round1(expected),
  });
  summary.bmi = round1(expected);
}

/**
 * Applies unit metadata (optional), clamps to sane lbs ranges, optionally fixes BMI vs profile.
 * Does **not** persist `weightUnit` / `massUnit`; callers should save the returned summaries as-is.
 */
export function normalizeWearableSummariesForStorage(
  rows: WearableInbound[],
  profile?: UserProfile | undefined
): WearableDaySummary[] {
  return rows.map((row) => normalizeOneWearableRow(row, profile));
}

export function normalizeOneWearableRow(
  raw: WearableInbound,
  profile?: UserProfile | undefined
): WearableDaySummary {
  const wUnit = raw.weightUnit ?? "lbs"; // canonical default: pounds (see scale entry API `weightLbs`)
  const mUnit = raw.muscleMassUnit ?? "lbs";

  const sansUnits = stripInboundUnitFields(raw);
  const { weight: rawWeight, muscleMass: rawMuscle, ...rest } = sansUnits;

  let weight = rawWeight;
  if (typeof weight === "number" && Number.isFinite(weight) && weight > 0) {
    weight = wUnit === "kg" ? weight * LB_PER_KG : weight;
    weight = round1(weight);
    if (weight < 44 || weight > 1100) {
      logInfo("wearable-weight-drop", { date: raw.date, provider: raw.provider, weight: rawWeight, unit: wUnit });
      weight = undefined;
    }
  }

  let muscleMass = rawMuscle;
  if (typeof muscleMass === "number" && Number.isFinite(muscleMass) && muscleMass > 0) {
    muscleMass = mUnit === "kg" ? muscleMass * LB_PER_KG : muscleMass;
    muscleMass = round1(muscleMass);
    if (muscleMass > 500) {
      logInfo("wearable-muscle-drop", { date: raw.date, provider: raw.provider, muscleMass: rawMuscle, unit: mUnit });
      muscleMass = undefined;
    }
  }

  const out: WearableDaySummary = {
    ...rest,
    ...(typeof weight === "number" ? { weight } : {}),
    ...(typeof muscleMass === "number" ? { muscleMass } : {}),
  };

  if (profile) {
    reconcileBmi(out, weight, profile);
  }

  return out;
}

/**
 * **Pounds are the product default** (`normalizeOneWearableRow` defaults `weightUnit` to `lbs`;
 * `/api/wearables/scale/entry` uses `weightLbs`). This only catches rows where a **kg** reading
 * was persisted without unit metadata (legacy sync/import) — not "assume the scale sent kg."
 */
function shouldTreatWeightAsKgMislabeled(
  weightLbsAsStored: number,
  heightIn: number | undefined,
  reportedBmi: number | undefined
): boolean {
  if (weightLbsAsStored < 35 || weightLbsAsStored > 125) return false;
  if (heightIn == null || heightIn < 54 || heightIn > 96) return false;

  const bmiAsLbs = bmiFromWeightLbsHeightIn(weightLbsAsStored, heightIn);
  const bmiAsKgToLbs = bmiFromWeightLbsHeightIn(weightLbsAsStored * LB_PER_KG, heightIn);
  if (bmiAsKgToLbs < 15 || bmiAsKgToLbs > 42) return false;

  // Stored number cannot plausibly be an adult scale reading in **lb** (e.g. 83 at 5'10" ≈ BMI 12).
  if (bmiAsLbs < 12.3) return true;

  // Ambiguous band: use scale-reported BMI when it clearly matches the kg interpretation.
  if (reportedBmi != null && Number.isFinite(reportedBmi) && bmiAsLbs < 14) {
    const dL = Math.abs(reportedBmi - bmiAsLbs);
    const dK = Math.abs(reportedBmi - bmiAsKgToLbs);
    if (dK + 1 < dL) return true;
  }
  return false;
}

function repairScaleRow(row: WearableDaySummary, profile?: UserProfile | undefined): WearableDaySummary {
  if (row.provider !== "scale") {
    return row;
  }

  const out: WearableDaySummary = { ...row };
  const heightIn = profileHeightInches(profile);

  const bf = out.bodyFatPercent;
  const bfPlausible = bf != null && Number.isFinite(bf) && bf >= 4 && bf <= 60;

  if (typeof out.weight === "number" && out.weight > 0 && out.weight < 0.5 && bfPlausible) {
    logInfo("wearable-repair-clear-weight", { date: out.date, weight: out.weight });
    delete out.weight;
  }
  if (typeof out.muscleMass === "number" && out.muscleMass > 0 && out.muscleMass < 0.5 && bfPlausible) {
    logInfo("wearable-repair-clear-muscle", { date: out.date, muscleMass: out.muscleMass });
    delete out.muscleMass;
  }

  if (typeof out.weight === "number" && out.weight > 0) {
    if (shouldTreatWeightAsKgMislabeled(out.weight, heightIn, out.bmi)) {
      const beforeW = out.weight;
      const beforeM = out.muscleMass;
      out.weight = round1(out.weight * LB_PER_KG);
      logInfo("wearable-repair-kg-as-lbs-weight", { date: out.date, before: beforeW, after: out.weight });
      if (typeof beforeM === "number" && beforeM > 0 && beforeM >= 10 && beforeM <= 130) {
        const scaledM = round1(beforeM * LB_PER_KG);
        if (scaledM <= out.weight * 0.98) {
          out.muscleMass = scaledM;
          logInfo("wearable-repair-kg-as-lbs-muscle", { date: out.date, before: beforeM, after: scaledM });
        }
      }
    }
  }

  if (profile && typeof out.weight === "number") {
    reconcileBmi(out, out.weight, profile);
  }

  return out;
}

/**
 * Fix legacy / mis-synced **scale** rows already stored as canonical lbs:
 * - clears absurd micro-masses when body fat % looks real (typical CSV / double-conversion garbage)
 * - upgrades **kg persisted without unit metadata** when BMI proves the stored number cannot be lb
 *   (product default is **pounds**; we do not infer kg from profile weight alone)
 *
 * Safe for non-scale providers (no-op). Idempotent for already-correct lbs values.
 */
export function repairWearableScaleRowsForCanonicalLbs(
  rows: WearableDaySummary[],
  profile?: UserProfile | undefined
): WearableDaySummary[] {
  return rows.map((r) => repairScaleRow(r, profile));
}
