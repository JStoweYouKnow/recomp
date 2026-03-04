"use client";

import { useState } from "react";
import type { HydrationEntry } from "@/lib/types";
import { getHydration, saveHydration } from "@/lib/storage";
import { syncToServer } from "@/lib/storage";
import { getTodayLocal } from "@/lib/date-utils";
import { v4 as uuidv4 } from "uuid";

const DEFAULT_TARGET_ML = 2000;
const QUICK_ADD = [250, 500, 750, 1000] as const;

export function HydrationWidget() {
  const [entries, setEntries] = useState<HydrationEntry[]>(() => getHydration());
  const today = getTodayLocal();
  const todayEntries = entries.filter((e) => e.date === today);
  const todayTotal = todayEntries.reduce((s, e) => s + e.amountMl, 0);
  const target = DEFAULT_TARGET_ML;
  const pct = target > 0 ? Math.min(100, Math.round((todayTotal / target) * 100)) : 0;

  const addLog = (amountMl: number) => {
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
          {todayTotal} / {target} ml
        </span>
      </div>
      <div className="progress-track !mt-0">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {QUICK_ADD.map((ml) => (
          <button
            key={ml}
            type="button"
            onClick={() => addLog(ml)}
            className="btn-secondary text-xs py-1.5 px-2.5"
          >
            +{ml} ml
          </button>
        ))}
      </div>
    </div>
  );
}
