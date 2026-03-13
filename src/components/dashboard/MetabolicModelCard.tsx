"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";
import type { MetabolicModel, MetabolicDataPoint } from "@/lib/types";
import { getMetabolicModel, saveMetabolicModel, getMeals, getWearableData, getProfile, getPlan } from "@/lib/storage";
import { syncToServer } from "@/lib/storage";

const lbsToKg = (lbs: number) => lbs * 0.45359237;

function TDEEExplainer() {
  const [open, setOpen] = useState(false);

  return (
    <div className="text-xs">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-[var(--accent)] hover:underline"
      >
        {open ? "Hide explanation" : "How does Adaptive TDEE work?"}
      </button>
      {open && (
        <div className="mt-2 space-y-3 text-[var(--muted)] leading-relaxed">
          <p>
            Most TDEE calculators use generic formulas based on age, height, and
            an activity guess. <strong className="text-[var(--foreground)]">Adaptive TDEE</strong> learns
            your <em>actual</em> metabolism from your own data.
          </p>

          <div className="grid grid-cols-3 gap-2 text-center py-2">
            <div className="rounded-lg bg-[var(--surface-alt,var(--background))] p-2">
              <div className="text-base font-bold text-[var(--foreground)]">1</div>
              <div className="text-[10px] leading-tight mt-0.5">You log meals &amp; weigh-ins</div>
            </div>
            <div className="rounded-lg bg-[var(--surface-alt,var(--background))] p-2">
              <div className="text-base font-bold text-[var(--foreground)]">2</div>
              <div className="text-[10px] leading-tight mt-0.5">AI compares intake vs. weight change</div>
            </div>
            <div className="rounded-lg bg-[var(--surface-alt,var(--background))] p-2">
              <div className="text-base font-bold text-[var(--foreground)]">3</div>
              <div className="text-[10px] leading-tight mt-0.5">Your real burn rate emerges</div>
            </div>
          </div>

          <p>
            <strong className="text-[var(--foreground)]">Example:</strong> If
            you eat 2,000 cal/day and lose 1 lb per week, you&apos;re actually
            burning ~2,500 cal/day — the 500 cal deficit accounts for the fat
            loss (~3,500 cal/lb ÷ 7 days).
          </p>

          <div className="rounded-lg border border-[var(--border-soft)] p-2 space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-[var(--muted)]" />
              <span><strong className="text-[var(--foreground)]">7 days:</strong> Initial estimate appears</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-[var(--accent-warm)]" />
              <span><strong className="text-[var(--foreground)]">14 days:</strong> Estimate stabilizes</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-[var(--accent)]" />
              <span><strong className="text-[var(--foreground)]">30+ days:</strong> High confidence — macro targets auto-adjust</span>
            </div>
          </div>

          <p className="text-[var(--muted)] italic">
            Unlike static calculators, your TDEE updates as your body adapts —
            so your plan stays accurate even as you gain muscle or lose fat.
          </p>
        </div>
      )}
    </div>
  );
}

export function MetabolicModelCard() {
  const { showToast } = useToast();
  const [model, setModel] = useState<MetabolicModel | null>(() => getMetabolicModel());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpdate = async () => {
    setLoading(true);
    setError(null);
    try {
      const meals = getMeals();
      const wearable = getWearableData();
      const profile = getProfile();
      const plan = getPlan();
      const targets = plan?.dietPlan?.dailyTargets ?? { calories: 2000, protein: 150, carbs: 200, fat: 65 };
      const baseWeightKg = profile ? profile.weight : 75;

      const byDate = new Map<string, { intake: number; weightKg?: number; expenditure?: number }>();
      for (const m of meals) {
        const cur = byDate.get(m.date) ?? { intake: 0, weightKg: undefined, expenditure: undefined };
        cur.intake += m.macros.calories;
        byDate.set(m.date, cur);
      }
      for (const w of wearable) {
        const cur = byDate.get(w.date);
        if (cur) {
          cur.weightKg = w.weight != null ? lbsToKg(w.weight) : baseWeightKg;
          cur.expenditure = w.caloriesBurned;
        } else {
          byDate.set(w.date, {
            intake: 0,
            weightKg: w.weight != null ? lbsToKg(w.weight) : baseWeightKg,
            expenditure: w.caloriesBurned,
          });
        }
      }
      let prevWeightKg = baseWeightKg;
      const sortedDates = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      const dataPoints: MetabolicDataPoint[] = [];
      for (const [date, d] of sortedDates) {
        if (d.intake > 0) {
          const w = d.weightKg ?? prevWeightKg;
          if (d.weightKg != null) prevWeightKg = d.weightKg;
          dataPoints.push({
            date,
            weightKg: w,
            totalIntake: d.intake,
            totalExpenditure: d.expenditure ?? targets.calories,
          });
        }
      }
      dataPoints.sort((a, b) => a.date.localeCompare(b.date));

      if (dataPoints.length < 7) {
        setLoading(false);
        showToast("Log meals and weight for 7+ days to update your model", "info");
        return;
      }
      const res = await fetch("/api/metabolic/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataPoints, currentTDEE: targets.calories }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const next: MetabolicModel = {
        estimatedTDEE: data.estimatedTDEE ?? targets.calories,
        confidence: data.confidence ?? 0,
        dataPoints: data.dataPoints ?? dataPoints,
        lastUpdated: data.lastUpdated ?? new Date().toISOString(),
        history: data.history ?? [],
      };
      setModel(next);
      saveMetabolicModel(next);
      syncToServer();
      showToast("Metabolic model updated");
    } catch (err) {
      setModel(getMetabolicModel());
      const msg = err instanceof Error ? err.message : "Could not update model. Try again.";
      setError(msg);
      showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  };

  const displayModel = model ?? getMetabolicModel();

  if (!displayModel || displayModel.confidence < 20) {
    return (
      <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-4">
        <h4 className="text-sm font-semibold mb-1">Adaptive TDEE</h4>
        <p className="text-xs text-[var(--muted)] mb-3">
          Log meals and weight for 7+ days to learn your true metabolism.
        </p>
        <TDEEExplainer />
        {error && (
          <p className="text-xs text-[var(--accent-terracotta)] mb-2" role="alert">{error}</p>
        )}
        <button
          type="button"
          onClick={handleUpdate}
          disabled={loading}
          className="btn-secondary text-xs py-1.5 disabled:opacity-50"
        >
          {loading ? "Updating…" : "Update model"}
        </button>
      </div>
    );
  }

  const tdee = Math.round(displayModel.estimatedTDEE);
  const confidenceColor = displayModel.confidence >= 70 ? "text-[var(--accent)]" : displayModel.confidence >= 40 ? "text-[var(--accent-warm)]" : "text-[var(--muted)]";

  return (
    <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-4 space-y-2">
      <h4 className="text-sm font-semibold">Adaptive TDEE</h4>
      {error && (
        <p className="text-xs text-[var(--accent-terracotta)]" role="alert">{error}</p>
      )}
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-bold tabular-nums">{tdee}</span>
        <span className="text-xs text-[var(--muted)]">cal/day</span>
        <span className={`text-xs font-medium ${confidenceColor}`}>({displayModel.confidence}% confidence)</span>
      </div>
      <p className="text-label text-[var(--muted)]">
        Based on {displayModel.dataPoints.length} data points. Used for macro calculations when available.
      </p>
      <TDEEExplainer />
      <button
        type="button"
        onClick={handleUpdate}
        disabled={loading}
        className="text-xs text-[var(--accent)] hover:underline disabled:opacity-50"
      >
        {loading ? "Updating…" : "Refresh model"}
      </button>
    </div>
  );
}
