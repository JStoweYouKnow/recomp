import type { UserProfile } from "./types";

export const ML_PER_FL_OZ = 29.5735;
export const KG_PER_LB = 0.45359237;

export function getUnitSystem(profile: UserProfile | null | undefined): "us" | "metric" {
  return profile?.unitSystem === "metric" ? "metric" : "us";
}

export function lbsToKg(lbs: number): number {
  return lbs * KG_PER_LB;
}

export function kgToLbs(kg: number): number {
  return kg / KG_PER_LB;
}

export function cmToFeetInches(cm: number): { ft: number; inch: number } {
  const totalInches = cm / 2.54;
  const ft = Math.floor(totalInches / 12);
  const inch = Math.round(totalInches - ft * 12);
  return inch === 12 ? { ft: ft + 1, inch: 0 } : { ft, inch };
}

export function flOzToMl(flOz: number): number {
  return Math.round(flOz * ML_PER_FL_OZ);
}

export function mlToFlOz(ml: number): number {
  return ml / ML_PER_FL_OZ;
}

export function formatHydrationAmount(ml: number, unitSystem: "us" | "metric"): string {
  if (unitSystem === "metric") return `${Math.round(ml)} ml`;
  return `${Math.round(mlToFlOz(ml))} fl oz`;
}
