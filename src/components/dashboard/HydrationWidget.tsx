"use client";

import { useState } from "react";
import type { HydrationEntry } from "@/lib/types";
import { getHydration, saveHydration } from "@/lib/storage";
import { syncToServer } from "@/lib/storage";
import { getTodayLocal } from "@/lib/date-utils";
import { flOzToMl, mlToFlOz } from "@/lib/units";
import { v4 as uuidv4 } from "uuid";

const DEFAULT_TARGET_ML = 2000;
const DEFAULT_TARGET_FL_OZ = 64;
const QUICK_ADD_ML = [250, 500, 750, 1000] as const;
const QUICK_ADD_FL_OZ = [8, 12, 16, 24] as const;

export function HydrationWidget({ unitSystem = "us" }: { unitSystem?: "us" | "metric" }) {
  const [entries, setEntries] = useState<HydrationEntry[]>(() => getHydration());
  const today = getTodayLocal();
  const todayEntries = entries.filter((e) => e.date === today);
  const todayTotalMl = todayEntries.reduce((s, e) => s + e.amountMl, 0);
  const targetMl = unitSystem === "metric" ? DEFAULT_TARGET_ML : flOzToMl(DEFAULT_TARGET_FL_OZ);
  const pct = targetMl > 0 ? Math.min(100, Math.round((todayTotalMl / targetMl) * 100)) : 0;
  const todayTotalFlOz = Math.round(mlToFlOz(todayTotalMl));

  const addLogMl = (amountMl: number) => {
    const now = new Date();
    const entry: HydrationEntry = {
      id: uuidv4(),
      date: today,
      time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
      amountMl,
      source: "water",
    };
    const next = [...entries, entry];
    setEntries(next);
    saveHydration(next);
    syncToServer();
  };
  const addLog = (amountFlOz: number) => addLogMl(flOzToMl(amountFlOz));

  return (
    <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent-slate)]/10 text-[var(--accent-slate)]">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 2.69l5.66 5.66a8 8 0 11-11.32 0L12 2.69z" />
          </svg>
        </span>
        <h4 className="text-sm font-semibold">Hydration</h4>
        <span className="text-[10px] text-[var(--muted)] ml-auto tabular-nums">
          {unitSystem === "metric"
            ? `${todayTotalMl} / ${DEFAULT_TARGET_ML} ml`
            : `${todayTotalFlOz} / ${DEFAULT_TARGET_FL_OZ} fl oz`}
        </span>
      </div>
      <div className="progress-track !mt-0">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {unitSystem === "metric"
          ? QUICK_ADD_ML.map((ml) => (
              <button
                key={ml}
                type="button"
                onClick={() => addLogMl(ml)}
                className="btn-secondary text-xs py-1.5 px-2.5"
              >
                +{ml} ml
              </button>
            ))
          : QUICK_ADD_FL_OZ.map((flOz) => (
              <button
                key={flOz}
                type="button"
                onClick={() => addLog(flOz)}
                className="btn-secondary text-xs py-1.5 px-2.5"
              >
                +{flOz} fl oz
              </button>
            ))}
      </div>
    </div>
  );
}
