"use client";

import { useState } from "react";
import type { BiofeedbackEntry } from "@/lib/types";
import { getBiofeedback, saveBiofeedback } from "@/lib/storage";
import { syncToServer } from "@/lib/storage";
import { getTodayLocal } from "@/lib/date-utils";
import { v4 as uuidv4 } from "uuid";

const LABELS: { key: keyof Pick<BiofeedbackEntry, "energy" | "mood" | "hunger" | "stress" | "soreness">; label: string }[] = [
  { key: "energy", label: "Energy" },
  { key: "mood", label: "Mood" },
  { key: "hunger", label: "Hunger" },
  { key: "stress", label: "Stress" },
  { key: "soreness", label: "Soreness" },
];

export function BiofeedbackQuickEntry() {
  const [entries, setEntries] = useState<BiofeedbackEntry[]>(() => getBiofeedback());
  const today = getTodayLocal();
  const latest = entries.filter((e) => e.date === today).sort((a, b) => b.time.localeCompare(a.time))[0];
  const [expanded, setExpanded] = useState(false);
  const [energy, setEnergy] = useState(latest?.energy ?? 3);
  const [mood, setMood] = useState(latest?.mood ?? 3);
  const [hunger, setHunger] = useState(latest?.hunger ?? 3);
  const [stress, setStress] = useState(latest?.stress ?? 3);
  const [soreness, setSoreness] = useState(latest?.soreness ?? 3);
  const [notes, setNotes] = useState(latest?.notes ?? "");

  const save = () => {
    const now = new Date();
    const entry: BiofeedbackEntry = {
      id: uuidv4(),
      date: today,
      time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
      energy,
      mood,
      hunger,
      stress,
      soreness,
      notes: notes.trim() || undefined,
    };
    const next = [...entries, entry];
    setEntries(next);
    saveBiofeedback(next);
    syncToServer();
    setExpanded(false);
  };

  return (
    <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">How are you feeling?</h4>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-[var(--accent)] hover:underline"
        >
          {expanded ? "Cancel" : latest ? "Update" : "Log"}
        </button>
      </div>
      {expanded ? (
        <div className="space-y-2 animate-fade-in">
          {LABELS.map(({ key, label }) => {
            const val = key === "energy" ? energy : key === "mood" ? mood : key === "hunger" ? hunger : key === "stress" ? stress : soreness;
            const set = key === "energy" ? setEnergy : key === "mood" ? setMood : key === "hunger" ? setHunger : key === "stress" ? setStress : setSoreness;
            return (
              <div key={key} className="flex items-center justify-between gap-2">
                <span className="text-xs text-[var(--muted)] w-20">{label}</span>
                <input
                  type="range"
                  min={1}
                  max={5}
                  value={val}
                  onChange={(e) => set(Number(e.target.value))}
                  className="flex-1 h-2 accent-[var(--accent)]"
                />
                <span className="text-xs font-medium tabular-nums w-6">{val}</span>
              </div>
            );
          })}
          <input
            type="text"
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full text-xs px-2 py-1.5 rounded-lg border border-[var(--border-soft)] bg-[var(--background)]"
          />
          <button type="button" onClick={save} className="btn-primary text-xs w-full py-2">
            Save
          </button>
        </div>
      ) : latest ? (
        <p className="text-xs text-[var(--muted)]">
          Last: E{latest.energy} M{latest.mood} H{latest.hunger} S{latest.stress} P{latest.soreness}
          {latest.notes && ` — ${latest.notes}`}
        </p>
      ) : (
        <p className="text-xs text-[var(--muted)]">Quick check-in helps correlate with meals & recovery</p>
      )}
    </div>
  );
}
