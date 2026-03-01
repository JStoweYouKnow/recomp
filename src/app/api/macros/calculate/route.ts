import { NextRequest, NextResponse } from "next/server";
import { calculateMacros } from "@/lib/macro-calculator";
import type { Macros } from "@/lib/types";

/** POST { weightKg, heightCm, age, gender, dailyActivityLevel, goal } => Macros (Healthy Eater style) */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { weightKg, heightCm, age, gender, dailyActivityLevel, goal } = body;

    const macros = calculateMacros({
      weightKg: Number(weightKg) || 70,
      heightCm: Number(heightCm) || 170,
      age: Number(age) || 30,
      gender: gender === "female" ? "female" : "male",
      dailyActivityLevel: dailyActivityLevel || "moderate",
      goal: goal || "maintain",
    });

    return NextResponse.json({ macros } as { macros: Macros });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Calculation failed" },
      { status: 500 }
    );
  }
}
