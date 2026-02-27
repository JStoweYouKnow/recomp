"use client";

import { useState, useMemo } from "react";
import { useToast } from "@/components/Toast";
import { getBadgeInfo } from "@/lib/milestones";
import { getTodayLocal } from "@/lib/date-utils";
import type { Milestone, WearableDaySummary } from "@/lib/types";


const BADGE_ICONS: Record<string, string> = {
  first_meal: "🍽️",
  meal_streak_3: "🔥",
  meal_streak_7: "⚡",
  meal_streak_14: "💪",
  meal_streak_30: "🏆",
  macro_hit_week: "🎯",
  macro_hit_month: "👑",
  week_warrior: "📅",
  plan_adjuster: "🔄",
  early_adopter: "⌚",
  wearable_synced: "📊",
};

export function MilestonesView({
  milestones,
  xp,
  progress,
  wearableData = [],
  onDataFetched,
}: {
  milestones: Milestone[];
  xp: number;
  progress: Record<string, number>;
  wearableData?: WearableDaySummary[];
  onDataFetched?: (data: WearableDaySummary[]) => void;
}) {
  const { showToast } = useToast();
  const [scaleDate, setScaleDate] = useState(() => getTodayLocal());
  const [scaleWeight, setScaleWeight] = useState("");
  const [scaleBodyFat, setScaleBodyFat] = useState("");
  const [scaleMuscle, setScaleMuscle] = useState("");
  const [scaleBmi, setScaleBmi] = useState("");
  const [scaleSkeletalMuscle, setScaleSkeletalMuscle] = useState("");
  const [scaleFatFreeMass, setScaleFatFreeMass] = useState("");
  const [scaleSubcutaneousFat, setScaleSubcutaneousFat] = useState("");
  const [scaleVisceralFat, setScaleVisceralFat] = useState("");
  const [scaleBodyWater, setScaleBodyWater] = useState("");
  const [scaleBoneMass, setScaleBoneMass] = useState("");
  const [scaleProtein, setScaleProtein] = useState("");
  const [scaleBmr, setScaleBmr] = useState("");
  const [scaleMetabolicAge, setScaleMetabolicAge] = useState("");
  const [loading, setLoading] = useState(false);

  const hasExtras = useMemo(() => {
    return wearableData.some(
      (d) =>
        d.bmi != null ||
        d.skeletalMusclePercent != null ||
        d.visceralFat != null ||
        d.bodyWaterPercent != null ||
        d.boneMass != null ||
        d.proteinPercent != null ||
        d.bmr != null ||
        d.metabolicAge != null
    );
  }, [wearableData]);

  const measurementHistory = useMemo(() => {
    return wearableData
      .filter(
        (d) =>
          d.weight != null ||
          d.bodyFatPercent != null ||
          d.muscleMass != null ||
          d.bmi != null ||
          d.bmr != null ||
          d.metabolicAge != null
      )
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 50);
  }, [wearableData]);

  const addManualWeight = async () => {
    const lbs = parseFloat(scaleWeight);
    if (!Number.isFinite(lbs) || lbs < 44 || lbs > 1100) {
      showToast("Enter weight in lbs (44–1100)", "info");
      return;
    }
    setLoading(true);
    try {
      const r = await fetch("/api/wearables/scale/entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: scaleDate,
          weightLbs: lbs,
          bodyFatPercent: scaleBodyFat ? parseFloat(scaleBodyFat) : undefined,
          muscleMass: scaleMuscle ? parseFloat(scaleMuscle) : undefined,
          bmi: scaleBmi ? parseFloat(scaleBmi) : undefined,
          skeletalMusclePercent: scaleSkeletalMuscle ? parseFloat(scaleSkeletalMuscle) : undefined,
          fatFreeMass: scaleFatFreeMass ? parseFloat(scaleFatFreeMass) : undefined,
          subcutaneousFatPercent: scaleSubcutaneousFat ? parseFloat(scaleSubcutaneousFat) : undefined,
          visceralFat: scaleVisceralFat ? parseFloat(scaleVisceralFat) : undefined,
          bodyWaterPercent: scaleBodyWater ? parseFloat(scaleBodyWater) : undefined,
          boneMass: scaleBoneMass ? parseFloat(scaleBoneMass) : undefined,
          proteinPercent: scaleProtein ? parseFloat(scaleProtein) : undefined,
          bmr: scaleBmr ? parseFloat(scaleBmr) : undefined,
          metabolicAge: scaleMetabolicAge ? parseFloat(scaleMetabolicAge) : undefined,
        }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      if (d.data && onDataFetched) onDataFetched(d.data);
      setScaleWeight("");
      setScaleBodyFat("");
      setScaleMuscle("");
      setScaleBmi("");
      setScaleSkeletalMuscle("");
      setScaleFatFreeMass("");
      setScaleSubcutaneousFat("");
      setScaleVisceralFat("");
      setScaleBodyWater("");
      setScaleBoneMass("");
      setScaleProtein("");
      setScaleBmr("");
      setScaleMetabolicAge("");
    } catch (err) {
      console.error(err);
      showToast(err instanceof Error ? err.message : "Failed to add weight", "error");
    } finally {
      setLoading(false);
    }
  };

  const badgeInfo = getBadgeInfo();
  const level = Math.floor(Math.sqrt(xp / 100)) + 1;
  const xpForNext = (level * level) * 100 - xp;
  const xpInLevel = xp - ((level - 1) * (level - 1) * 100);
  const xpNeededForLevel = (level * level) * 100 - ((level - 1) * (level - 1) * 100);
  const levelProgress = Math.min(100, (xpInLevel / xpNeededForLevel) * 100);

  const earnedIds = new Set<string>(milestones.map((m) => m.id));
  const allBadges = Object.entries(badgeInfo);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Body measurements */}
      <div className="card rounded-xl p-4 space-y-3">
        <h3 className="font-semibold text-[var(--foreground)] text-sm">Body measurements</h3>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-6">
          <div>
            <label className="label text-[10px]">Date</label>
            <input
              type="date"
              value={scaleDate}
              onChange={(e) => setScaleDate(e.target.value.slice(0, 10))}
              className="input-base w-full text-sm py-1.5"
            />
          </div>
          <div>
            <label className="label text-[10px]">Weight (lbs)</label>
            <input
              type="number"
              step="0.1"
              min={44}
              max={1100}
              value={scaleWeight}
              onChange={(e) => setScaleWeight(e.target.value)}
              placeholder="e.g. 165"
              className="input-base w-full text-sm py-1.5"
            />
          </div>
          <div>
            <label className="label text-[10px]">Body fat %</label>
            <input
              type="number"
              step="0.1"
              min={0}
              max={100}
              value={scaleBodyFat}
              onChange={(e) => setScaleBodyFat(e.target.value)}
              placeholder="e.g. 18"
              className="input-base w-full text-sm py-1.5"
            />
          </div>
          <div>
            <label className="label text-[10px]">Muscle (lbs)</label>
            <input
              type="number"
              step="0.1"
              min={0}
              max={500}
              value={scaleMuscle}
              onChange={(e) => setScaleMuscle(e.target.value)}
              placeholder="e.g. 85"
              className="input-base w-full text-sm py-1.5"
            />
          </div>
          <div>
            <label className="label text-[10px]">BMI</label>
            <input
              type="number"
              step="0.1"
              min={10}
              max={60}
              value={scaleBmi}
              onChange={(e) => setScaleBmi(e.target.value)}
              placeholder="e.g. 23.5"
              className="input-base w-full text-sm py-1.5"
            />
          </div>
          <div>
            <label className="label text-[10px]">Sk. muscle %</label>
            <input
              type="number"
              step="0.1"
              min={0}
              max={100}
              value={scaleSkeletalMuscle}
              onChange={(e) => setScaleSkeletalMuscle(e.target.value)}
              placeholder="e.g. 56"
              className="input-base w-full text-sm py-1.5"
            />
          </div>
          <div>
            <label className="label text-[10px]">Fat-free (lbs)</label>
            <input
              type="number"
              step="0.1"
              min={0}
              max={500}
              value={scaleFatFreeMass}
              onChange={(e) => setScaleFatFreeMass(e.target.value)}
              placeholder="e.g. 161"
              className="input-base w-full text-sm py-1.5"
            />
          </div>
          <div>
            <label className="label text-[10px]">Subq. fat %</label>
            <input
              type="number"
              step="0.1"
              min={0}
              max={100}
              value={scaleSubcutaneousFat}
              onChange={(e) => setScaleSubcutaneousFat(e.target.value)}
              placeholder="e.g. 11"
              className="input-base w-full text-sm py-1.5"
            />
          </div>
          <div>
            <label className="label text-[10px]">Visceral fat</label>
            <input
              type="number"
              step="1"
              min={0}
              max={30}
              value={scaleVisceralFat}
              onChange={(e) => setScaleVisceralFat(e.target.value)}
              placeholder="e.g. 6"
              className="input-base w-full text-sm py-1.5"
            />
          </div>
          <div>
            <label className="label text-[10px]">Body water %</label>
            <input
              type="number"
              step="0.1"
              min={0}
              max={100}
              value={scaleBodyWater}
              onChange={(e) => setScaleBodyWater(e.target.value)}
              placeholder="e.g. 63"
              className="input-base w-full text-sm py-1.5"
            />
          </div>
          <div>
            <label className="label text-[10px]">Bone (lbs)</label>
            <input
              type="number"
              step="0.1"
              min={0}
              max={110}
              value={scaleBoneMass}
              onChange={(e) => setScaleBoneMass(e.target.value)}
              placeholder="e.g. 8"
              className="input-base w-full text-sm py-1.5"
            />
          </div>
          <div>
            <label className="label text-[10px]">Protein %</label>
            <input
              type="number"
              step="0.1"
              min={0}
              max={100}
              value={scaleProtein}
              onChange={(e) => setScaleProtein(e.target.value)}
              placeholder="e.g. 20"
              className="input-base w-full text-sm py-1.5"
            />
          </div>
          <div>
            <label className="label text-[10px]">BMR (kcal)</label>
            <input
              type="number"
              step="1"
              min={500}
              max={5000}
              value={scaleBmr}
              onChange={(e) => setScaleBmr(e.target.value)}
              placeholder="e.g. 1951"
              className="input-base w-full text-sm py-1.5"
            />
          </div>
          <div>
            <label className="label text-[10px]">Metabolic age</label>
            <input
              type="number"
              step="1"
              min={10}
              max={100}
              value={scaleMetabolicAge}
              onChange={(e) => setScaleMetabolicAge(e.target.value)}
              placeholder="e.g. 36"
              className="input-base w-full text-sm py-1.5"
            />
          </div>
        </div>
        <button onClick={addManualWeight} disabled={loading || !scaleWeight.trim()} className="btn-primary text-xs py-1.5 px-3 disabled:opacity-50">
          {loading ? "Adding…" : "Add weigh-in"}
        </button>
      </div>

      {measurementHistory.length > 0 && (
        <div className="card rounded-xl p-4">
          <h3 className="font-semibold text-[var(--foreground)] mb-3 text-sm">History</h3>
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border-soft)]">
                  <th className="text-left py-1.5 px-1.5 font-medium text-[var(--muted)]">Date</th>
                  <th className="text-right py-1.5 px-1.5 font-medium text-[var(--muted)]">Weight</th>
                  <th className="text-right py-1.5 px-1.5 font-medium text-[var(--muted)]">Body fat</th>
                  <th className="text-right py-1.5 px-1.5 font-medium text-[var(--muted)]">Muscle</th>
                  {hasExtras && <th className="text-right py-1.5 px-1.5 font-medium text-[var(--muted)]">BMI</th>}
                  {hasExtras && <th className="text-right py-1.5 px-1.5 font-medium text-[var(--muted)]">BMR</th>}
                  {hasExtras && <th className="text-right py-1.5 px-1.5 font-medium text-[var(--muted)]">Met. age</th>}
                  <th className="text-left py-1.5 px-1.5 font-medium text-[var(--muted)]">Source</th>
                </tr>
              </thead>
              <tbody>
                {measurementHistory.slice(0, 10).map((d) => (
                  <tr key={`${d.date}-${d.provider}`} className="border-b border-[var(--border-soft)]/50">
                    <td className="py-1.5 px-1.5">{d.date}</td>
                    <td className="text-right py-1.5 px-1.5 tabular-nums">{d.weight != null ? `${Math.round(d.weight)} lbs` : "—"}</td>
                    <td className="text-right py-1.5 px-1.5 tabular-nums">{d.bodyFatPercent != null ? `${d.bodyFatPercent}%` : "—"}</td>
                    <td className="text-right py-1.5 px-1.5 tabular-nums">{d.muscleMass != null ? `${Math.round(d.muscleMass)} lbs` : "—"}</td>
                    {hasExtras && <td className="text-right py-1.5 px-1.5 tabular-nums">{d.bmi != null ? d.bmi.toFixed(1) : "—"}</td>}
                    {hasExtras && <td className="text-right py-1.5 px-1.5 tabular-nums">{d.bmr != null ? Math.round(d.bmr) : "—"}</td>}
                    {hasExtras && <td className="text-right py-1.5 px-1.5 tabular-nums">{d.metabolicAge != null ? d.metabolicAge : "—"}</td>}
                    <td className="py-1.5 px-1.5 text-[var(--muted)] capitalize">{d.provider}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card rounded-xl p-4">
        <h2 className="mb-3 text-base font-semibold text-[var(--accent)]">Level & XP</h2>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent)]/20 text-lg font-bold text-[var(--accent)]">
              {level}
            </div>
            <div>
              <p className="text-[10px] text-[var(--muted)]">Level</p>
              <p className="text-base font-bold">{level}</p>
            </div>
          </div>
          <div className="flex-1 min-w-[160px]">
            <div className="mb-0.5 flex justify-between text-[10px] text-[var(--muted)]">
              <span>{xp} XP</span>
              <span>{xpForNext} to next</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--border-soft)]">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-all duration-500"
                style={{ width: `${levelProgress}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="card rounded-xl p-4">
        <h2 className="mb-3 text-base font-semibold text-[var(--accent)]">Badges</h2>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {allBadges.map(([id, info]) => {
            const earned = earnedIds.has(id);
            const displayProgress = id.startsWith("meal_streak")
              ? progress[`streak_${id.replace("meal_streak_", "")}`]
              : id === "macro_hit_week"
                ? progress.macro_week
                : id === "week_warrior"
                  ? progress.week_warrior
                  : null;

            return (
              <div
                key={id}
                className={`flex flex-col items-center rounded-lg border p-2 transition ${
                  earned
                    ? "border-[var(--accent)]/50 bg-[var(--accent)]/10"
                    : "border-[var(--border)] bg-[var(--surface-elevated)] opacity-90"
                }`}
              >
                <span className="mb-1 text-lg">{BADGE_ICONS[id] ?? "🏅"}</span>
                <p className="text-center text-[11px] font-medium text-[var(--foreground)] leading-tight">{info.name}</p>
                <p className="mt-0.5 text-center text-[9px] text-[var(--muted)] leading-tight line-clamp-2">{info.desc}</p>
                {!earned && displayProgress != null && displayProgress > 0 && (
                  <div className="mt-1 w-full">
                    <div className="h-0.5 overflow-hidden rounded-full bg-[var(--border-soft)]">
                      <div
                        className="h-full rounded-full bg-[var(--accent)]/50"
                        style={{ width: `${displayProgress}%` }}
                      />
                    </div>
                  </div>
                )}
                {earned && <p className="mt-0.5 text-[9px] text-[var(--accent)]">+{info.xp} XP</p>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
