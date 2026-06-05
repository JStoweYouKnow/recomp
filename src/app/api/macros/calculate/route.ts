import { NextRequest, NextResponse } from "next/server";
import { calculateMacros } from "@/lib/macro-calculator";
import type { Macros, MeasurementTargets } from "@/lib/types";

/** POST body: core profile fields + optional learnedTDEE, measurementTargets, currentBodyFatPercent, currentMuscleMassLbs */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      weightKg,
      heightCm,
      age,
      gender,
      dailyActivityLevel,
      goal,
      learnedTDEE,
      measurementTargets,
      currentBodyFatPercent,
      currentMuscleMassLbs,
    } = body;

    const lt = learnedTDEE != null ? Number(learnedTDEE) : undefined;
    const mt = measurementTargets as MeasurementTargets | undefined;
    const cbf =
      currentBodyFatPercent != null && Number.isFinite(Number(currentBodyFatPercent))
        ? Number(currentBodyFatPercent)
        : undefined;
    const cmm =
      currentMuscleMassLbs != null && Number.isFinite(Number(currentMuscleMassLbs))
        ? Number(currentMuscleMassLbs)
        : undefined;

    const macros = calculateMacros({
      weightKg: Number(weightKg) || 70,
      heightCm: Number(heightCm) || 170,
      age: Number(age) || 30,
      gender:
        gender === "female" ? "female" : gender === "male" ? "male" : gender === "other" ? "other" : "male",
      dailyActivityLevel: dailyActivityLevel || "moderate",
      goal: goal || "maintain",
      learnedTDEE: lt != null && lt >= 1200 && lt <= 5000 ? lt : undefined,
      measurementTargets:
        mt &&
        ((mt.targetWeightLbs != null && Number.isFinite(mt.targetWeightLbs)) ||
          (mt.targetBodyFatPercent != null && Number.isFinite(mt.targetBodyFatPercent)) ||
          (mt.targetMuscleMassLbs != null && Number.isFinite(mt.targetMuscleMassLbs)))
          ? mt
          : undefined,
      currentBodyFatPercent: cbf,
      currentMuscleMassLbs: cmm,
    });

    return NextResponse.json({ macros } as { macros: Macros });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Calculation failed" },
      { status: 500 }
    );
  }
}
