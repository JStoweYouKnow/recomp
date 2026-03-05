"use client";

import { useState, useMemo, useEffect } from "react";
import { useToast } from "@/components/Toast";
import { getBadgeInfo, SEASONAL_BADGES, HIDDEN_BADGES, getCurrentSeason, getSeasonDaysLeft } from "@/lib/milestones";
import { getTodayLocal } from "@/lib/date-utils";
import { getMeasurementTargets, saveMeasurementTargets, getBiofeedback, getMeals, getBodyScans, saveBodyScans, syncToServer } from "@/lib/storage";
import { WeeklyRecapCard } from "@/components/WeeklyRecapCard";
import type { Milestone, WearableDaySummary, MeasurementTargets, BodyScan, MealEntry, Macros } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";


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
  // Seasonal
  spring_sprinter: "🌸",
  summer_shred: "☀️",
  harvest_gains: "🍂",
  winter_warrior: "❄️",
  // Hidden
  silent_assassin: "🥷",
  night_owl: "🦉",
  perfectionist: "💎",
  social_butterfly: "🦋",
  chatterbox: "💬",
  // Duel
  duel_champion: "⚔️",
};

const KONAMI_CODE = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];

export function MilestonesView({
  milestones,
  xp,
  progress,
  wearableData = [],
  onDataFetched,
  meals = [],
  streak = 0,
  macroTargets,
}: {
  milestones: Milestone[];
  xp: number;
  progress: Record<string, number>;
  wearableData?: WearableDaySummary[];
  onDataFetched?: (data: WearableDaySummary[]) => void;
  meals?: MealEntry[];
  streak?: number;
  macroTargets?: Macros;
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
  const [targets, setTargets] = useState<MeasurementTargets>({});
  const [targetWeight, setTargetWeight] = useState("");
  const [targetBodyFat, setTargetBodyFat] = useState("");
  const [targetMuscle, setTargetMuscle] = useState("");
  const [bodyScanLoading, setBodyScanLoading] = useState(false);
  const [bodyScanResult, setBodyScanResult] = useState<{ analysis?: string; bodyFatEstimate?: number | null; muscleAssessment?: string | null } | null>(null);
  const [bodyScans, setBodyScans] = useState<BodyScan[]>(() => getBodyScans());
  const [biofeedbackInsightsLoading, setBiofeedbackInsightsLoading] = useState(false);
  const [biofeedbackInsights, setBiofeedbackInsights] = useState<{ correlations: { factor: string; observation: string; strength: string }[]; recommendations: string[] } | null>(null);
  const [reelProcessing, setReelProcessing] = useState(false);
  const [reelMessage, setReelMessage] = useState<string | null>(null);
  const [reelVideoUrl, setReelVideoUrl] = useState<string | null>(null);
  const [reelIsDemo, setReelIsDemo] = useState(false);
  const [konamiUnlocked, setKonamiUnlocked] = useState(false);

  // Konami code easter egg
  useEffect(() => {
    let idx = 0;
    const handler = (e: KeyboardEvent) => {
      if (e.key === KONAMI_CODE[idx]) {
        idx++;
        if (idx === KONAMI_CODE.length) {
          setKonamiUnlocked(true);
          idx = 0;
        }
      } else {
        idx = 0;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    const t = getMeasurementTargets();
    if (t) {
      setTargets(t);
      setTargetWeight(t.targetWeightLbs != null ? String(t.targetWeightLbs) : "");
      setTargetBodyFat(t.targetBodyFatPercent != null ? String(t.targetBodyFatPercent) : "");
      setTargetMuscle(t.targetMuscleMassLbs != null ? String(t.targetMuscleMassLbs) : "");
    }
  }, []);

  const saveTargets = (next: MeasurementTargets) => {
    setTargets(next);
    saveMeasurementTargets(next);
  };

  const handleSaveTargets = () => {
    const tw = targetWeight.trim() ? parseFloat(targetWeight) : undefined;
    const tb = targetBodyFat.trim() ? parseFloat(targetBodyFat) : undefined;
    const tm = targetMuscle.trim() ? parseFloat(targetMuscle) : undefined;
    if (tw == null && tb == null && tm == null) {
      saveTargets({});
      return;
    }
    const next: MeasurementTargets = {};
    if (tw != null && Number.isFinite(tw) && tw >= 44 && tw <= 1100) next.targetWeightLbs = tw;
    if (tb != null && Number.isFinite(tb) && tb >= 0 && tb <= 100) next.targetBodyFatPercent = tb;
    if (tm != null && Number.isFinite(tm) && tm >= 0 && tm <= 500) next.targetMuscleMassLbs = tm;
    saveTargets(next);
    showToast("Targets saved", "success");
  };

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
  const seasonalSet = new Set<string>(SEASONAL_BADGES);
  const hiddenSet = new Set<string>(HIDDEN_BADGES);
  const allBadges = Object.entries(badgeInfo).filter(
    ([id]) => !seasonalSet.has(id) && !hiddenSet.has(id)
  );

  // Seasonal
  const season = getCurrentSeason();
  const seasonDaysLeft = getSeasonDaysLeft();
  const seasonalBadges = SEASONAL_BADGES.map((id) => ({ id, ...badgeInfo[id] }));

  // Hidden
  const hiddenBadges = HIDDEN_BADGES.map((id) => ({ id, ...badgeInfo[id] }));

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

      {/* Body scan */}
      <div className="card rounded-xl p-4 space-y-3">
        <h3 className="font-semibold text-[var(--foreground)] text-sm">Body scan</h3>
        <p className="text-[11px] text-[var(--muted)]">Upload a front, side, or back photo for AI body composition assessment.</p>
        <label className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-elevated)] px-3 py-2 text-xs cursor-pointer hover:bg-[var(--surface-elevated)]/80">
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={bodyScanLoading}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setBodyScanLoading(true);
              setBodyScanResult(null);
              try {
                const { prepareImageForUpload } = await import("@/lib/image-utils");
                const blob = await prepareImageForUpload(file);
                const fd = new FormData();
                fd.append("image", blob, "body.jpg");
                const res = await fetch("/api/body-scan/analyze", { method: "POST", body: fd });
                const data = await res.json();
                if (data.error) throw new Error(data.error);
                setBodyScanResult(data);
                const entry: BodyScan = {
                  id: uuidv4(),
                  date: new Date().toISOString().slice(0, 10),
                  photos: {},
                  analysis: data.analysis,
                  bodyFatEstimate: data.bodyFatEstimate ?? undefined,
                  muscleAssessment: data.muscleAssessment ?? undefined,
                };
                const scans = [entry, ...getBodyScans()];
                saveBodyScans(scans);
                setBodyScans(scans);
                syncToServer();
                showToast("Analysis saved");
              } catch {
                showToast("Analysis failed", "error");
              } finally {
                setBodyScanLoading(false);
                e.target.value = "";
              }
            }}
          />
          {bodyScanLoading ? "Analyzing…" : "Upload photo"}
        </label>
        {bodyScanResult && (
          <div className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-elevated)] p-3 space-y-2 text-sm animate-fade-in">
            {bodyScanResult.analysis && <p className="text-[var(--foreground)]">{bodyScanResult.analysis}</p>}
            {bodyScanResult.bodyFatEstimate != null && (
              <p className="font-medium text-[var(--accent)]">Est. body fat: {bodyScanResult.bodyFatEstimate}%</p>
            )}
            {bodyScanResult.muscleAssessment && <p className="text-[var(--muted)]">{bodyScanResult.muscleAssessment}</p>}
          </div>
        )}
        {bodyScans.length >= 2 && (
          <>
            <button
              type="button"
              onClick={async () => {
                try {
                  setReelVideoUrl(null);
                  const res = await fetch("/api/body-scan/progress-reel", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ scanDates: bodyScans.slice(0, 5).map((s) => s.date).sort() }),
                  });
                  const data = await res.json();
                  if (data.error) throw new Error(data.error);

                  if (data.videoUrl && data.status === "completed") {
                    setReelVideoUrl(data.videoUrl);
                    setReelProcessing(false);
                    setReelMessage(null);
                    setReelIsDemo(Boolean(data.isDemo));
                    showToast(data.isDemo ? "Demo video — configure S3 for real reels" : "Progress reel ready");
                    return;
                  }

                  if (data.jobId) {
                    const msg = data.message ?? `Generating progress reel from ${data.scanCount ?? bodyScans.length} scans.`;
                    setReelMessage(msg);
                    setReelProcessing(true);
                    showToast(msg);
                    const poll = async () => {
                      try {
                        const pollRes = await fetch(`/api/body-scan/progress-reel?jobId=${encodeURIComponent(data.jobId)}`);
                        const pollData = await pollRes.json();
                        if (pollData.error) return;
                        if (pollData.status === "Completed" && pollData.videoUrl) {
                          setReelVideoUrl(pollData.videoUrl);
                          setReelProcessing(false);
                          setReelMessage(null);
                          setReelIsDemo(false);
                          showToast("Progress reel ready");
                          return;
                        }
                        if (pollData.status === "Failed") {
                          setReelProcessing(false);
                          setReelMessage(null);
                          showToast(pollData.failureMessage ?? "Video generation failed", "error");
                          return;
                        }
                        setTimeout(poll, 5000);
                      } catch {
                        setReelProcessing(false);
                        setReelMessage(null);
                        showToast("Failed to check progress", "error");
                      }
                    };
                    setTimeout(poll, 5000);
                    setTimeout(() => {
                      setReelProcessing(false);
                      setReelMessage(null);
                    }, 120_000);
                  } else {
                    const msg = data.message ?? "Progress reel requested.";
                    setReelMessage(msg);
                    setReelProcessing(true);
                    showToast(msg);
                    setTimeout(() => {
                      setReelProcessing(false);
                      setReelMessage(null);
                    }, 120_000);
                  }
                } catch {
                  showToast("Failed to start progress reel", "error");
                }
              }}
              disabled={reelProcessing}
              className="rounded-lg border border-[var(--accent)]/40 px-3 py-2 text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent)]/10 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {reelProcessing ? "Processing…" : "Generate progress reel"}
            </button>
            {reelProcessing && reelMessage && (
              <div className="rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-3 text-xs text-[var(--foreground)] animate-fade-in">
                <p className="font-medium text-[var(--accent)]">Video generation in progress</p>
                <p className="mt-1 text-[var(--muted)]">{reelMessage}</p>
                <p className="mt-2 text-[10px] text-[var(--muted)]">Nova Reel may take a few minutes. Check back later or enable push notifications to be notified when it’s ready.</p>
              </div>
            )}
            {reelVideoUrl && (
              <div className="rounded-lg border border-[var(--accent)]/30 bg-[var(--surface-elevated)] p-3 animate-fade-in">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-[var(--accent)]">Your progress reel</p>
                  {reelIsDemo && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-[var(--muted)]/20 text-[var(--muted)]">
                      Demo — set NOVA_REEL_S3_BUCKET for real generation
                    </span>
                  )}
                </div>
                <video src={reelVideoUrl} controls className="w-full max-h-48 rounded-lg" />
                <button type="button" onClick={() => { setReelVideoUrl(null); setReelIsDemo(false); }} className="mt-2 text-xs text-[var(--muted)] hover:underline">Dismiss</button>
              </div>
            )}
          </>
        )}
        {bodyScans.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-[var(--muted)]">Previous scans</p>
            <div className="flex flex-wrap gap-2 max-h-20 overflow-y-auto">
              {bodyScans.slice(0, 8).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setBodyScanResult({ analysis: s.analysis, bodyFatEstimate: s.bodyFatEstimate, muscleAssessment: s.muscleAssessment })}
                  className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-elevated)] px-2.5 py-1.5 text-xs text-left hover:border-[var(--accent)]/40"
                >
                  {s.date} {s.bodyFatEstimate != null ? `· ${s.bodyFatEstimate}%` : ""}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Biofeedback insights */}
      <div className="card rounded-xl p-4 space-y-3">
        <h3 className="font-semibold text-[var(--foreground)] text-sm">Biofeedback insights</h3>
        <p className="text-[11px] text-[var(--muted)]">AI correlations between your energy, mood, meals, and sleep.</p>
        <button
          onClick={async () => {
            setBiofeedbackInsightsLoading(true);
            setBiofeedbackInsights(null);
            try {
              const biofeedback = getBiofeedback();
              const meals = getMeals();
              const twoWeeksAgo = new Date();
              twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
              const cutoff = twoWeeksAgo.toISOString().slice(0, 10);
              const recentBio = biofeedback.filter((b) => b.date >= cutoff);
              const recentMeals = meals.filter((m) => m.date >= cutoff).map((m) => ({ date: m.date, name: m.name, macros: m.macros }));
              const res = await fetch("/api/biofeedback/insights", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  biofeedback: recentBio,
                  meals: recentMeals,
                  wearableData: wearableData.filter((d) => d.date >= cutoff),
                }),
              });
              const data = await res.json();
              if (data.error) throw new Error(data.error);
              setBiofeedbackInsights(data);
              showToast("Insights ready");
            } catch {
              showToast("Failed to fetch insights", "error");
            } finally {
              setBiofeedbackInsightsLoading(false);
            }
          }}
          disabled={biofeedbackInsightsLoading}
          className="btn-primary text-xs py-1.5 px-3 disabled:opacity-50"
        >
          {biofeedbackInsightsLoading ? "Analyzing…" : "Get insights"}
        </button>
        {biofeedbackInsights && (
          <div className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-elevated)] p-3 space-y-3 text-sm animate-fade-in">
            {biofeedbackInsights.correlations?.length ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-2">Correlations</p>
                <ul className="space-y-1.5">
                  {biofeedbackInsights.correlations.map((c, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="font-medium shrink-0">{c.factor}</span>
                      <span className="text-[var(--muted)]">{c.observation}</span>
                      <span className="text-[10px] text-[var(--accent)]">{c.strength}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {biofeedbackInsights.recommendations?.length ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-2">Recommendations</p>
                <ul className="list-disc list-inside space-y-1 text-[var(--foreground)]">
                  {biofeedbackInsights.recommendations.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Measurement targets */}
      <div className="card rounded-xl p-4 space-y-3">
        <h3 className="font-semibold text-[var(--foreground)] text-sm">Measurement targets</h3>
        <p className="text-[11px] text-[var(--muted)]">Set goals to track progress. Leave blank to skip.</p>
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
          <div>
            <label className="label text-[10px]">Target weight (lbs)</label>
            <input
              type="number"
              step="0.1"
              min={44}
              max={1100}
              value={targetWeight}
              onChange={(e) => setTargetWeight(e.target.value)}
              placeholder="e.g. 165"
              className="input-base w-full text-sm py-1.5"
            />
          </div>
          <div>
            <label className="label text-[10px]">Target body fat %</label>
            <input
              type="number"
              step="0.1"
              min={0}
              max={100}
              value={targetBodyFat}
              onChange={(e) => setTargetBodyFat(e.target.value)}
              placeholder="e.g. 18"
              className="input-base w-full text-sm py-1.5"
            />
          </div>
          <div>
            <label className="label text-[10px]">Target muscle (lbs)</label>
            <input
              type="number"
              step="0.1"
              min={0}
              max={500}
              value={targetMuscle}
              onChange={(e) => setTargetMuscle(e.target.value)}
              placeholder="e.g. 90"
              className="input-base w-full text-sm py-1.5"
            />
          </div>
        </div>
        <button onClick={handleSaveTargets} className="btn-primary text-xs py-1.5 px-3">
          Save targets
        </button>
      </div>

      {measurementHistory.length > 0 && (targets.targetWeightLbs != null || targets.targetBodyFatPercent != null || targets.targetMuscleMassLbs != null) && (
        <div className="card rounded-xl p-4">
          <h3 className="font-semibold text-[var(--foreground)] mb-3 text-sm">Progress toward targets</h3>
          <div className="flex flex-wrap gap-4 text-sm">
            {targets.targetWeightLbs != null && measurementHistory[0]?.weight != null && (() => {
              const curr = measurementHistory[0].weight!;
              const tgt = targets.targetWeightLbs!;
              const delta = (tgt - curr);
              return (
                <div className="flex items-center gap-2">
                  <span className="text-[var(--muted)]">Weight:</span>
                  <span className="font-medium tabular-nums">{Math.round(curr)} → {tgt} lbs</span>
                  <span className="text-[10px] text-[var(--muted)]">
                    {delta === 0 ? "✓ at target" : delta > 0 ? `+${delta.toFixed(1)} to gain` : `${delta.toFixed(1)} to lose`}
                  </span>
                </div>
              );
            })()}
            {targets.targetBodyFatPercent != null && measurementHistory[0]?.bodyFatPercent != null && (() => {
              const curr = measurementHistory[0].bodyFatPercent!;
              const tgt = targets.targetBodyFatPercent!;
              const delta = (tgt - curr);
              return (
                <div className="flex items-center gap-2">
                  <span className="text-[var(--muted)]">Body fat:</span>
                  <span className="font-medium tabular-nums">{curr}% → {tgt}%</span>
                  <span className="text-[10px] text-[var(--muted)]">
                    {delta === 0 ? "✓ at target" : delta > 0 ? `+${delta.toFixed(1)}% to gain` : `${delta.toFixed(1)}% to lose`}
                  </span>
                </div>
              );
            })()}
            {targets.targetMuscleMassLbs != null && measurementHistory[0]?.muscleMass != null && (() => {
              const curr = measurementHistory[0].muscleMass!;
              const tgt = targets.targetMuscleMassLbs!;
              const delta = (tgt - curr);
              return (
                <div className="flex items-center gap-2">
                  <span className="text-[var(--muted)]">Muscle:</span>
                  <span className="font-medium tabular-nums">{Math.round(curr)} → {tgt} lbs</span>
                  <span className="text-[10px] text-[var(--muted)]">
                    {delta === 0 ? "✓ at target" : delta > 0 ? `+${delta.toFixed(1)} to gain` : `${delta.toFixed(1)} to lose`}
                  </span>
                </div>
              );
            })()}
          </div>
        </div>
      )}

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

      {/* Seasonal Badges */}
      <div className="card rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-[var(--accent)]">
            {BADGE_ICONS[season.badge]} {season.name} Challenge
          </h2>
          <span className="text-xs text-[var(--muted)]">{seasonDaysLeft} days left</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {seasonalBadges.map((badge) => {
            const earned = earnedIds.has(badge.id);
            const isActive = badge.id === season.badge;
            const badgeProgress = progress[badge.id] ?? 0;
            return (
              <div
                key={badge.id}
                className={`flex flex-col items-center rounded-lg border p-3 transition ${
                  earned
                    ? "badge-seasonal border-[var(--accent)]/50 bg-[var(--accent)]/10"
                    : isActive
                      ? "border-[var(--accent)]/30 bg-[var(--surface-elevated)]"
                      : "border-[var(--border)] bg-[var(--surface-elevated)] opacity-50"
                }`}
              >
                <span className="mb-1 text-xl">{BADGE_ICONS[badge.id] ?? "🏅"}</span>
                <p className="text-center text-[11px] font-medium leading-tight">{badge.name}</p>
                <p className="mt-0.5 text-center text-[9px] text-[var(--muted)] leading-tight">{badge.desc}</p>
                {!earned && isActive && badgeProgress > 0 && (
                  <div className="mt-1.5 w-full">
                    <div className="h-1 overflow-hidden rounded-full bg-[var(--border-soft)]">
                      <div
                        className="h-full rounded-full bg-[var(--accent)]"
                        style={{ width: `${badgeProgress}%` }}
                      />
                    </div>
                    <p className="mt-0.5 text-center text-[8px] text-[var(--muted)]">{Math.round(badgeProgress)}%</p>
                  </div>
                )}
                {earned && <p className="mt-0.5 text-[9px] text-[var(--accent)]">+{badge.xp} XP</p>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Hidden Badges */}
      <div className="card rounded-xl p-4">
        <h2 className="mb-3 text-base font-semibold text-[var(--accent)]">Hidden Achievements</h2>
        <p className="text-[11px] text-[var(--muted)] mb-3">Secret badges for those who go the extra mile. Can you find them all?</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {hiddenBadges.map((badge) => {
            const earned = earnedIds.has(badge.id);
            return (
              <div
                key={badge.id}
                className={`flex flex-col items-center rounded-lg border p-2.5 transition ${
                  earned
                    ? "border-[var(--accent)]/50 bg-[var(--accent)]/10"
                    : "badge-mystery border-dashed"
                }`}
              >
                <span className="mb-1 text-lg">{earned ? (BADGE_ICONS[badge.id] ?? "🏅") : "❓"}</span>
                <p className="text-center text-[11px] font-medium leading-tight">
                  {earned ? badge.name : "???"}
                </p>
                <p className="mt-0.5 text-center text-[9px] text-[var(--muted)] leading-tight">
                  {earned ? badge.desc : konamiUnlocked ? badge.desc : "Keep exploring..."}
                </p>
                {earned && <p className="mt-0.5 text-[9px] text-[var(--accent)]">+{badge.xp} XP</p>}
              </div>
            );
          })}
        </div>
        {konamiUnlocked && (
          <p className="mt-3 text-[10px] text-center text-[var(--accent)] animate-fade-in">
            Konami code activated! Hidden badge hints revealed above.
          </p>
        )}
      </div>

      {/* Weekly Recap */}
      {macroTargets && (
        <WeeklyRecapCard
          meals={meals}
          milestones={milestones}
          xp={xp}
          streak={streak}
          targets={macroTargets}
        />
      )}
    </div>
  );
}
