"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { getWorkoutProgress, getWeeklyReview, saveWeeklyReview, getActivityLog, saveActivityLog } from "@/lib/storage";
import { CalendarView } from "./CalendarView";
import { getTodayLocal } from "@/lib/date-utils";
import { TodayAtAGlance } from "./dashboard/TodayAtAGlance";
import { WeeklyReviewCard } from "./dashboard/WeeklyReviewCard";
import { TransformationPreview } from "./dashboard/TransformationPreview";
import { ShoppingList } from "./dashboard/ShoppingList";
import { EvidenceResultsCard } from "./dashboard/EvidenceResultsCard";
import { ExerciseDemoGif } from "./ExerciseDemoGif";
import type { UserProfile, FitnessPlan, MealEntry, Macros, WearableDaySummary, WeeklyReview, ActivityLogEntry } from "@/lib/types";

/* ── Exercise GIF cache (localStorage-backed) ── */
interface ExerciseGif {
  gifUrl: string;
  name: string;
  targetMuscles?: string[];
  instructions?: string[];
}
const EX_CACHE_KEY = "recomp_exercise_gifs_v2";
function getGifCache(): Record<string, ExerciseGif> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(EX_CACHE_KEY) ?? "{}"); } catch { return {}; }
}
function setGifCache(cache: Record<string, ExerciseGif>) {
  try { localStorage.setItem(EX_CACHE_KEY, JSON.stringify(cache)); } catch { /* quota */ }
}

export function Dashboard({
  profile,
  plan,
  meals,
  todaysTotals,
  targets,
  wearableData,
  onProfileUpdate,
  onPlanUpdate,
  onRegeneratePlan,
  planRegenerating,
  planLoadingMessage,
  onReset,
  onNavigateToMeals,
  onNavigateToWorkouts,
}: {
  profile: UserProfile;
  plan: FitnessPlan | null;
  meals: MealEntry[];
  todaysTotals: Macros;
  targets: Macros;
  wearableData?: WearableDaySummary[];
  onProfileUpdate: (p: UserProfile) => void;
  onPlanUpdate: (p: FitnessPlan) => void;
  onRegeneratePlan: () => void;
  planRegenerating: boolean;
  planLoadingMessage?: string;
  onReset: () => void;
  onNavigateToMeals?: () => void;
  onNavigateToWorkouts?: () => void;
}) {
  const kgToLbs = (kg: number): number => kg * 2.2046226218;
  const cmToFeetInches = (cm: number): { ft: number; inch: number } => {
    const totalInches = cm / 2.54;
    const ft = Math.floor(totalInches / 12);
    const inch = Math.round(totalInches - (ft * 12));
    if (inch === 12) return { ft: ft + 1, inch: 0 };
    return { ft, inch };
  };
  const displayWeightLbs = Math.round(kgToLbs(profile.weight));
  const displayHeight = cmToFeetInches(profile.height);
  const MAX_AVATAR_SIZE = 160;

  const [weeklyReview, setWeeklyReview] = useState<WeeklyReview | null>(getWeeklyReview());
  const [reviewLoading, setReviewLoading] = useState(false);
  const workoutProgress = getWorkoutProgress();

  /* ── Exercise GIF visibility ── */
  const [expandedExerciseDemos, setExpandedExerciseDemos] = useState<Set<string>>(() => new Set());
  const [exerciseGifs, setExerciseGifs] = useState<Record<string, ExerciseGif | "loading" | "none">>(() => {
    const cached = getGifCache();
    const init: Record<string, ExerciseGif | "loading" | "none"> = {};
    for (const [k, v] of Object.entries(cached)) init[k] = v;
    return init;
  });

  const fetchExerciseGif = useCallback(async (exerciseName: string) => {
    const key = exerciseName.toLowerCase().trim();
    if (exerciseGifs[key] && exerciseGifs[key] !== "none") return;
    setExerciseGifs((prev) => ({ ...prev, [key]: "loading" }));
    try {
      const res = await fetch(`/api/exercises/search?name=${encodeURIComponent(key)}`);
      if (!res.ok) { setExerciseGifs((prev) => ({ ...prev, [key]: "none" })); return; }
      const data = await res.json();
      if (data.gifUrl) {
        const gif: ExerciseGif = { gifUrl: data.gifUrl, name: data.name, targetMuscles: data.targetMuscles, instructions: data.instructions };
        setExerciseGifs((prev) => {
          const next = { ...prev, [key]: gif };
          const cache = getGifCache();
          cache[key] = gif;
          setGifCache(cache);
          return next;
        });
      } else {
        setExerciseGifs((prev) => ({ ...prev, [key]: "none" }));
      }
    } catch {
      setExerciseGifs((prev) => ({ ...prev, [key]: "none" }));
    }
  }, [exerciseGifs]);

  const handleToggleDemo = useCallback((gifKey: string, expand: boolean) => {
    setExpandedExerciseDemos((prev) => {
      const n = new Set(prev);
      if (expand) n.add(gifKey);
      else n.delete(gifKey);
      return n;
    });
  }, []);

  // Activity / caloric budget state
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>(() => getActivityLog());
  const today = getTodayLocal();

  const todayActivities = activityLog.filter((e) => e.date === today);
  const todayAdjustment = todayActivities.reduce((sum, e) => sum + e.calorieAdjustment, 0);
  const baseBudget = targets.calories;
  const adjustedBudget = baseBudget + todayAdjustment;

  const addActivityEntry = (entry: ActivityLogEntry) => {
    const next = [...activityLog, entry];
    setActivityLog(next);
    saveActivityLog(next);
  };
  const removeActivityEntry = (id: string) => {
    const next = activityLog.filter((e) => e.id !== id);
    setActivityLog(next);
    saveActivityLog(next);
  };

  /* ── Dashboard calendar state ── */
  const [dashCalendarDate, setDashCalendarDate] = useState(today);
  const WEEKDAY_NAMES_DASH = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const SHORT_WEEKDAY_DASH = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const dashMealDates = useMemo(() => new Set(meals.map((m) => m.date)), [meals]);
  const dashDotDates = useMemo(() => {
    const s = new Set(dashMealDates);
    for (const ts of Object.values(workoutProgress)) {
      if (ts) s.add(ts.slice(0, 10));
    }
    return s;
  }, [dashMealDates, workoutProgress]);
  const dashDateCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of meals) map.set(m.date, (map.get(m.date) ?? 0) + 1);
    return map;
  }, [meals]);

  const matchDietDay = useCallback((date: string): number | null => {
    if (!plan) return null;
    const d = new Date(date + "T12:00:00");
    const dow = d.getDay();
    const dayName = WEEKDAY_NAMES_DASH[dow].toLowerCase();
    const shortName = SHORT_WEEKDAY_DASH[dow].toLowerCase();
    for (let i = 0; i < plan.dietPlan.weeklyPlan.length; i++) {
      const planDay = plan.dietPlan.weeklyPlan[i].day.toLowerCase().trim();
      if (planDay === dayName || planDay === shortName || planDay.startsWith(dayName) || planDay.startsWith(shortName)) return i;
    }
    const mondayBased = dow === 0 ? 6 : dow - 1;
    return mondayBased < plan.dietPlan.weeklyPlan.length ? mondayBased : null;
  }, [plan]);

  const matchWorkoutDay = useCallback((date: string): number | null => {
    if (!plan) return null;
    const d = new Date(date + "T12:00:00");
    const dow = d.getDay();
    const dayName = WEEKDAY_NAMES_DASH[dow].toLowerCase();
    const shortName = SHORT_WEEKDAY_DASH[dow].toLowerCase();
    for (let i = 0; i < plan.workoutPlan.weeklyPlan.length; i++) {
      const planDay = plan.workoutPlan.weeklyPlan[i].day.toLowerCase().trim();
      if (planDay === dayName || planDay === shortName || planDay.startsWith(dayName) || planDay.startsWith(shortName)) return i;
    }
    const mondayBased = dow === 0 ? 6 : dow - 1;
    return mondayBased < plan.workoutPlan.weeklyPlan.length ? mondayBased : null;
  }, [plan]);

  const dashCalMeals = useMemo(() => meals.filter((m) => m.date === dashCalendarDate), [meals, dashCalendarDate]);
  const dashCalMealTotals = useMemo(() => dashCalMeals.reduce(
    (acc, m) => ({ calories: acc.calories + m.macros.calories, protein: acc.protein + m.macros.protein, carbs: acc.carbs + m.macros.carbs, fat: acc.fat + m.macros.fat }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  ), [dashCalMeals]);

  const handleWeeklyReview = async () => {
    setReviewLoading(true);
    try {
      const res = await fetch("/api/agent/weekly-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meals,
          targets,
          wearableData: wearableData ?? [],
          goal: profile.goal,
          userName: profile.name,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const review = data as WeeklyReview;
      setWeeklyReview(review);
      saveWeeklyReview(review);
    } catch (e) {
      console.error(e);
    } finally {
      setReviewLoading(false);
    }
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      let w = img.width;
      let h = img.height;
      if (w > MAX_AVATAR_SIZE || h > MAX_AVATAR_SIZE) {
        if (w > h) { h = (h / w) * MAX_AVATAR_SIZE; w = MAX_AVATAR_SIZE; }
        else { w = (w / h) * MAX_AVATAR_SIZE; h = MAX_AVATAR_SIZE; }
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      onProfileUpdate({ ...profile, avatarDataUrl: dataUrl });
    };
    img.src = url;
    e.target.value = "";
  };

  return (
    <div className="space-y-8">
      {/* ── Page header (glassmorphism hero) ── */}
      <div className="section-organic glass-card rounded-2xl p-6 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-4 relative z-[1]">
          <label className="relative flex h-14 w-14 sm:h-16 sm:w-16 cursor-pointer group shrink-0 rounded-full" aria-label="Upload profile picture">
            <input type="file" accept="image/*" onChange={handleAvatarUpload} className="sr-only" />
            <div className="absolute inset-0 rounded-full overflow-hidden border-2 border-white/60 bg-[var(--surface-elevated)] ring-2 ring-transparent group-hover:ring-[var(--accent)]/30 transition-all shadow-md">
              {profile.avatarDataUrl ? (
                <img src={profile.avatarDataUrl} alt="Profile avatar" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[var(--muted)]">
                  <svg className="w-6 h-6 sm:w-8 sm:h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
                </div>
              )}
            </div>
            <span className="absolute inset-0 rounded-full flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors text-white text-xs font-medium opacity-0 group-hover:opacity-100 pointer-events-none">
              Upload
            </span>
          </label>
          <div>
            <h2 className="section-hero text-h4 text-[var(--foreground)]">Welcome back, {profile.name}</h2>
            <p className="section-subtitle mt-0.5">Here&apos;s your progress today</p>
          </div>
        </div>
        <div className="flex gap-1.5 relative z-[1]">
          {[
            [`${profile.age}`, "age"],
            [`${displayWeightLbs} lbs`, "weight"],
            [`${displayHeight.ft}′${displayHeight.inch}″`, "height"],
          ].map(([val, lbl]) => (
            <span key={lbl} className="badge badge-muted backdrop-blur-sm bg-white/60">
              <span className="text-[var(--foreground)] font-medium">{val}</span>
              <span>{lbl}</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── Plan loading / empty state (hackathon polish) ── */}
      {planRegenerating && (
        <div className="card p-8 text-center animate-fade-in overflow-hidden">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent)]/10 text-[var(--accent)] mb-4 animate-thinking-pulse">
            <svg className="h-7 w-7 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden>
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
          <h3 className="section-title !text-base mb-1">Creating your plan</h3>
          <p className="text-sm text-[var(--muted)]">{planLoadingMessage || "Amazon Nova is generating your personalized diet and workout plan…"}</p>
          <div className="mt-4 h-1.5 w-32 mx-auto rounded-full bg-[var(--border-soft)] overflow-hidden">
            <div className="h-full w-1/3 rounded-full bg-[var(--accent)] animate-pulse" style={{ width: "33%" }} />
          </div>
        </div>
      )}
      {!plan && !planRegenerating && (
        <div className="card p-8 text-center animate-fade-in border-dashed border-2 border-[var(--border-soft)]">
          <h3 className="section-title !text-base mb-2">No plan yet</h3>
          <p className="text-sm text-[var(--muted)] mb-4">Your personalized plan couldn’t be created or hasn’t loaded. Generate one now.</p>
          <button type="button" onClick={onRegeneratePlan} disabled={planRegenerating} className="btn-primary px-6 py-2.5">
            Generate my plan
          </button>
        </div>
      )}

      {/* ── Today at a Glance ── */}
      <div className="animate-fade-in stagger-1">
      <TodayAtAGlance
        plan={plan}
        meals={meals}
        todaysTotals={todaysTotals}
        targets={targets}
        todayAdjustment={todayAdjustment}
        baseBudget={baseBudget}
        adjustedBudget={adjustedBudget}
        today={today}
        workoutProgress={workoutProgress}
        exerciseGifs={exerciseGifs}
        expandedExerciseDemos={expandedExerciseDemos}
        onToggleDemo={handleToggleDemo}
        fetchExerciseGif={fetchExerciseGif}
        matchWorkoutDay={matchWorkoutDay}
        matchDietDay={matchDietDay}
        activityLog={activityLog}
        onAddActivity={addActivityEntry}
        onRemoveActivity={removeActivityEntry}
      />
      </div>

      {/* ── Calendar Navigator ── */}
      {plan && (
        <div className="space-y-4 animate-fade-in stagger-2">
          <div>
            <h3 className="section-title !text-base">Weekly calendar</h3>
            <p className="section-subtitle">Select a date to view diet and workout for that day</p>
          </div>
          <CalendarView
            selectedDate={dashCalendarDate}
            onSelectDate={setDashCalendarDate}
            dotDates={dashDotDates}
            dateCounts={dashDateCounts}
            defaultView="week"
          />
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Diet card */}
            <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent)]/10 text-[var(--accent)]">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </span>
                <h4 className="text-sm font-semibold">Diet</h4>
                <span className="text-[10px] text-[var(--muted)] ml-auto flex items-center gap-2">
                  {dashCalendarDate === today ? "Today" : new Date(dashCalendarDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  {onNavigateToMeals && (
                    <button type="button" onClick={onNavigateToMeals} className="text-[var(--accent)] hover:underline text-[10px] font-medium">Edit plan</button>
                  )}
                </span>
              </div>
              {dashCalMeals.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)] mb-1">Logged meals</p>
                  <div className="space-y-1">
                    {dashCalMeals.map((m) => (
                      <div key={m.id} className="flex items-center justify-between text-xs">
                        <span className="font-medium truncate">{m.name}</span>
                        <span className="text-[var(--muted)] tabular-nums flex-shrink-0 ml-2">{m.macros.calories} cal</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-1.5 pt-1.5 border-t border-[var(--border-soft)] flex justify-between text-xs font-semibold">
                    <span>Total</span>
                    <span className="tabular-nums">{dashCalMealTotals.calories} cal · {dashCalMealTotals.protein}g P · {dashCalMealTotals.carbs}g C · {dashCalMealTotals.fat}g F</span>
                  </div>
                </div>
              )}
              {(() => {
                const idx = matchDietDay(dashCalendarDate);
                if (idx === null) return <p className="text-xs text-[var(--muted)]">No diet plan for this day.</p>;
                const dietDay = plan.dietPlan.weeklyPlan[idx];
                if (!dietDay) return null;
                const dayTotal = dietDay.meals.reduce((s, m) => s + (m.macros?.calories ?? 0), 0);
                return (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)] mb-1">Suggested — {dietDay.day}</p>
                    <div className="space-y-1.5">
                      {dietDay.meals.map((m, i) => (
                        <div key={i} className="flex items-start justify-between gap-2 text-xs">
                          <div className="min-w-0">
                            <span className="font-medium capitalize">{m.mealType}</span>
                            <p className="text-[var(--muted)] truncate">{m.description}</p>
                          </div>
                          <span className="text-[var(--muted)] tabular-nums flex-shrink-0">{m.macros?.calories ?? 0} cal</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-1.5 pt-1.5 border-t border-[var(--border-soft)] text-xs text-[var(--muted)] tabular-nums text-right">
                      Plan total: <span className="font-semibold text-[var(--foreground)]">{dayTotal} cal</span>
                    </p>
                  </div>
                );
              })()}
            </div>
            {/* Workout card */}
            <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent-warm)]/10 text-[var(--accent-warm)]">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                  </svg>
                </span>
                <h4 className="text-sm font-semibold">Workout</h4>
                <span className="text-[10px] text-[var(--muted)] ml-auto flex items-center gap-2">
                  {dashCalendarDate === today ? "Today" : new Date(dashCalendarDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  {onNavigateToWorkouts && (
                    <button type="button" onClick={onNavigateToWorkouts} className="text-[var(--accent)] hover:underline text-[10px] font-medium">Edit plan</button>
                  )}
                </span>
              </div>
              {(() => {
                const idx = matchWorkoutDay(dashCalendarDate);
                if (idx === null) return <p className="text-xs text-[var(--muted)]">No workout scheduled for this day. Rest day!</p>;
                const workoutDay = plan.workoutPlan.weeklyPlan[idx];
                if (!workoutDay) return null;
                const completed = workoutDay.exercises.filter((ex) => {
                  const key = `${plan.id}:${workoutDay.day}:${ex.name}:${ex.sets}:${ex.reps}:${ex.notes ?? ""}`;
                  return Boolean(workoutProgress[key]);
                }).length;
                const total = workoutDay.exercises.length;
                const allDone = total > 0 && completed === total;
                return (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="text-xs font-semibold">{workoutDay.day}</p>
                        <p className="text-[10px] text-[var(--muted)]">{workoutDay.focus}</p>
                      </div>
                      <span className={`badge text-[10px] ${allDone ? "badge-accent" : "badge-muted"}`}>{completed}/{total} done</span>
                    </div>
                    {total > 0 && (
                      <div className="progress-track !mt-0 mb-2">
                        <div className="progress-fill" style={{ width: `${Math.round((completed / total) * 100)}%` }} />
                      </div>
                    )}
                    <div className="space-y-1">
                      {workoutDay.exercises.map((ex, i) => {
                        const key = `${plan.id}:${workoutDay.day}:${ex.name}:${ex.sets}:${ex.reps}:${ex.notes ?? ""}`;
                        const isDone = Boolean(workoutProgress[key]);
                        const gifKey = ex.name.toLowerCase().trim();
                        const gif = exerciseGifs[gifKey];
                        const isExpanded = expandedExerciseDemos.has(gifKey);
                        const showGif = typeof gif === "object" && gif.gifUrl && isExpanded;
                        return (
                          <div key={i} className={`rounded-md px-2 py-1 space-y-1 ${isDone ? "bg-[var(--accent)]/5" : ""}`}>
                            <div className="flex items-center gap-2 text-xs">
                              <span className={`flex-shrink-0 h-3.5 w-3.5 rounded-full border-2 ${isDone ? "border-[var(--accent)] bg-[var(--accent)]" : "border-[var(--border)]"}`}>
                                {isDone && <svg className="h-full w-full text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2}><path d="M2.5 6l2.5 2.5 4.5-4.5" /></svg>}
                              </span>
                              <span className={`flex-1 min-w-0 truncate ${isDone ? "line-through text-[var(--muted)]" : "font-medium"}`}>{ex.name}</span>
                              <span className="text-[var(--muted)] flex-shrink-0 tabular-nums">{ex.sets} x {ex.reps}</span>
                              <button
                                type="button"
                                onClick={() => { handleToggleDemo(gifKey, !isExpanded); if (!isExpanded) fetchExerciseGif(ex.name); }}
                                className="text-[10px] font-medium text-[var(--accent)] hover:underline flex-shrink-0"
                              >
                                {gif === "loading" ? "…" : showGif ? "Hide demo" : "Show demo"}
                              </button>
                            </div>
                            {showGif && gif && typeof gif === "object" && gif.gifUrl && (
                              <div className="pl-5 space-y-1">
                                <ExerciseDemoGif src={gif.gifUrl} alt={ex.name} targetMuscles={gif.targetMuscles} className="rounded-lg max-h-24 object-contain bg-[var(--surface-elevated)]" />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── Weekly AI Review ── */}
      <div className="animate-fade-in stagger-3">
      <WeeklyReviewCard
        weeklyReview={weeklyReview}
        reviewLoading={reviewLoading}
        onGenerate={handleWeeklyReview}
      />
      </div>

      {/* ── Evidence & Results ── */}
      <div className="animate-fade-in stagger-3">
        <EvidenceResultsCard />
      </div>

      {/* ── Wearable data ── */}
      {wearableData && wearableData.length > 0 && (
        <div className="card p-6">
          <h3 className="section-title !text-base mb-4">Wearable data</h3>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            {wearableData.slice(0, 5).map((d) => (
              <div key={`${d.date}-${d.provider}`} className="card-flat rounded-xl px-4 py-3">
                <p className="text-caption mb-1">{d.date} · {d.provider}</p>
                <p className="text-sm font-medium">
                  {d.weight != null && `${Math.round(kgToLbs(d.weight))} lbs`}
                  {d.bodyFatPercent != null && ` · ${d.bodyFatPercent}% fat`}
                  {d.steps != null && ` · ${d.steps.toLocaleString()} steps`}
                  {d.sleepScore != null && ` · Sleep ${d.sleepScore}`}
                  {d.readinessScore != null && ` · Ready ${d.readinessScore}`}
                  {!d.weight && !d.bodyFatPercent && !d.steps && !d.sleepScore && !d.readinessScore && "—"}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Transformation Preview ── */}
      <TransformationPreview profile={profile} onProfileUpdate={onProfileUpdate} />

      {/* ── Shopping list → Amazon (Nova Act) ── */}
      <ShoppingList plan={plan} />

      <div className="pt-6 mt-2 border-t border-[var(--border-soft)]">
        <button
          onClick={() => {
            if (typeof window !== "undefined" && window.confirm("This will clear all your data and return you to setup. Continue?")) {
              onReset();
            }
          }}
          className="btn-ghost text-xs text-[var(--muted)] hover:text-[var(--accent-terracotta)]"
          title="Clear all data and create a new plan"
        >
          Start over with new profile
        </button>
      </div>
    </div>
  );
}
