"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { getWorkoutProgress, getWeeklyReview, saveWeeklyReview, getActivityLog, saveActivityLog } from "@/lib/storage";
import { segmentPersonFromPhoto } from "@/lib/body-segmentation";
import { CalendarView } from "./CalendarView";
import type { UserProfile, FitnessPlan, MealEntry, Macros, WearableDaySummary, WeeklyReview, ActivityLogEntry, WorkoutLocation, WorkoutEquipment } from "@/lib/types";

/* ── Exercise GIF cache (localStorage-backed) ── */
interface ExerciseGif {
  gifUrl: string;
  name: string;
  targetMuscles?: string[];
  instructions?: string[];
}
const EX_CACHE_KEY = "recomp_exercise_gifs";
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
  onReset: () => void;
  /** Optional: switch to Meals tab for editing diet */
  onNavigateToMeals?: () => void;
  /** Optional: switch to Workouts tab for editing plan */
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

  const pct = (n: number, t: number) => (t > 0 ? Math.min(100, Math.round((n / t) * 100)) : 0);
  const [weeklyReview, setWeeklyReview] = useState<WeeklyReview | null>(getWeeklyReview());
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewExpanded, setReviewExpanded] = useState(false);
  const [groceryLoading, setGroceryLoading] = useState(false);
  const [groceryResults, setGroceryResults] = useState<Array<{ searchTerm: string; found?: boolean; product?: { price?: string }; addedToCart?: boolean; addToCartError?: string }> | null>(null);
  const [groceryError, setGroceryError] = useState<string | null>(null);
  const [groceryStore, setGroceryStore] = useState<"fresh" | "wholefoods" | "amazon">("fresh");
  const [groceryAddToCart, setGroceryAddToCart] = useState(false);
  const workoutProgress = getWorkoutProgress();
  const [workoutPrefsEditing, setWorkoutPrefsEditing] = useState(false);

  /* ── Exercise GIF visibility (which demos are expanded) ── */
  const [expandedExerciseDemos, setExpandedExerciseDemos] = useState<Set<string>>(() => new Set());

  /* ── Exercise GIF state ── */
  const [exerciseGifs, setExerciseGifs] = useState<Record<string, ExerciseGif | "loading" | "none">>(() => {
    const cached = getGifCache();
    const init: Record<string, ExerciseGif | "loading" | "none"> = {};
    for (const [k, v] of Object.entries(cached)) init[k] = v;
    return init;
  });

  const fetchExerciseGif = useCallback(async (exerciseName: string) => {
    const key = exerciseName.toLowerCase().trim();
    if (exerciseGifs[key] && exerciseGifs[key] !== "none") return; // already loaded or loading
    setExerciseGifs((prev) => ({ ...prev, [key]: "loading" }));
    try {
      const res = await fetch(`/api/exercises/search?name=${encodeURIComponent(key)}`);
      if (!res.ok) {
        setExerciseGifs((prev) => ({ ...prev, [key]: "none" }));
        return;
      }
      const data = await res.json();
      if (data.gifUrl) {
        const gif: ExerciseGif = { gifUrl: data.gifUrl, name: data.name, targetMuscles: data.targetMuscles, instructions: data.instructions };
        setExerciseGifs((prev) => {
          const next = { ...prev, [key]: gif };
          // persist to cache
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

  const DASHBOARD_EQUIPMENT_OPTIONS: { value: WorkoutEquipment; label: string }[] = [
    { value: "bodyweight", label: "Bodyweight" },
    { value: "free_weights", label: "Dumbbells" },
    { value: "barbells", label: "Barbells" },
    { value: "kettlebells", label: "Kettlebells" },
    { value: "machines", label: "Machines" },
    { value: "resistance_bands", label: "Resistance bands" },
    { value: "cardio_machines", label: "Cardio" },
    { value: "pull_up_bar", label: "Pull-up bar" },
    { value: "cable_machine", label: "Cable machine" },
  ];

  /* ── Diet plan mutation helpers ── */
  const updateDietDay = (
    dayIndex: number,
    updater: (day: FitnessPlan["dietPlan"]["weeklyPlan"][number]) => FitnessPlan["dietPlan"]["weeklyPlan"][number]
  ) => {
    if (!plan) return;
    const nextWeekly = plan.dietPlan.weeklyPlan.map((d, idx) => (idx === dayIndex ? updater(d) : d));
    const updated = { ...plan, dietPlan: { ...plan.dietPlan, weeklyPlan: nextWeekly } };
    onPlanUpdate(updated);
  };

  const updateDietMeal = (
    dayIndex: number,
    mealIndex: number,
    patch: Partial<FitnessPlan["dietPlan"]["weeklyPlan"][number]["meals"][number]>
  ) => {
    updateDietDay(dayIndex, (d) => ({
      ...d,
      meals: d.meals.map((m, i) => (i === mealIndex ? { ...m, ...patch } : m)),
    }));
  };

  const updateDietMealMacro = (
    dayIndex: number,
    mealIndex: number,
    field: keyof Macros,
    value: string
  ) => {
    if (!plan) return;
    const meal = plan.dietPlan.weeklyPlan[dayIndex]?.meals[mealIndex];
    if (!meal) return;
    const num = value === "" ? 0 : parseInt(value, 10);
    if (isNaN(num)) return;
    updateDietMeal(dayIndex, mealIndex, {
      macros: { ...meal.macros, [field]: num },
    });
  };

  const addDietMeal = (dayIndex: number) => {
    updateDietDay(dayIndex, (d) => ({
      ...d,
      meals: [...d.meals, { mealType: "snack", description: "", macros: { calories: 0, protein: 0, carbs: 0, fat: 0 } }],
    }));
  };

  const removeDietMeal = (dayIndex: number, mealIndex: number) => {
    updateDietDay(dayIndex, (d) => ({
      ...d,
      meals: d.meals.filter((_, i) => i !== mealIndex),
    }));
  };

  // Activity / caloric budget state
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>(() => getActivityLog());
  const [showActivityForm, setShowActivityForm] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  /* ── Dashboard calendar state ── */
  const [dashCalendarDate, setDashCalendarDate] = useState(today);

  /* ── Today at a glance expand state ── */
  const [todayWorkoutExpanded, setTodayWorkoutExpanded] = useState(false);
  const [todayDietExpanded, setTodayDietExpanded] = useState(false);

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

  const handleFindIngredients = async () => {
    if (!plan) return;
    const items = plan.dietPlan.weeklyPlan
      .slice(0, 3)
      .flatMap((d) => d.meals.map((m) => m.description.split(",")[0].trim()))
      .filter(Boolean)
      .slice(0, 6);
    if (items.length === 0) return;

    setGroceryLoading(true);
    setGroceryError(null);
    setGroceryResults(null);
    try {
      const res = await fetch("/api/act/grocery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, store: groceryStore, addToCart: groceryAddToCart }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unable to fetch grocery shortlist");
      setGroceryResults(Array.isArray(data.results) ? data.results : []);
    } catch (err) {
      setGroceryError(err instanceof Error ? err.message : "Unable to fetch grocery shortlist");
      setGroceryResults([]);
    } finally {
      setGroceryLoading(false);
    }
  };

  /* ── Dashboard calendar helpers ── */
  const WEEKDAY_NAMES_DASH = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const SHORT_WEEKDAY_DASH = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  /** Dates that have meals */
  const dashMealDates = useMemo(() => new Set(meals.map((m) => m.date)), [meals]);

  /** Combined dot-dates: meals + completed exercises */
  const dashDotDates = useMemo(() => {
    const s = new Set(dashMealDates);
    for (const ts of Object.values(workoutProgress)) {
      if (ts) s.add(ts.slice(0, 10));
    }
    return s;
  }, [dashMealDates, workoutProgress]);

  /** Combined counts per date */
  const dashDateCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of meals) map.set(m.date, (map.get(m.date) ?? 0) + 1);
    return map;
  }, [meals]);

  /** Match a selected date to a diet day index */
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

  /** Match a selected date to a workout day index */
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

  /** Meals for the calendar-selected date */
  const dashCalMeals = useMemo(() => meals.filter((m) => m.date === dashCalendarDate), [meals, dashCalendarDate]);
  const dashCalMealTotals = useMemo(() => dashCalMeals.reduce(
    (acc, m) => ({ calories: acc.calories + m.macros.calories, protein: acc.protein + m.macros.protein, carbs: acc.carbs + m.macros.carbs, fat: acc.fat + m.macros.fat }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  ), [dashCalMeals]);

  const [fullBodyPhotoLoading, setFullBodyPhotoLoading] = useState(false);
  const [goalPhotoLoading, setGoalPhotoLoading] = useState(false);
  const MAX_AVATAR_SIZE = 160;
  const handleFullBodyPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    setFullBodyPhotoLoading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => reject(new Error("Failed to read file"));
        r.readAsDataURL(file);
      });
      const segmented = await segmentPersonFromPhoto(dataUrl);
      onProfileUpdate({ ...profile, fullBodyPhotoDataUrl: segmented, goalPhotoDataUrl: undefined });
    } catch (err) {
      console.error("Full body photo error:", err);
      alert(err instanceof Error ? err.message : "Photo processing failed. Try a different image (JPEG or PNG).");
    } finally {
      setFullBodyPhotoLoading(false);
      e.target.value = "";
    }
  };

  const handleGenerateAfterImage = async () => {
    const photoUrl = profile.fullBodyPhotoDataUrl;
    if (!photoUrl) return;
    setGoalPhotoLoading(true);
    try {
      // Nova Canvas IMAGE_VARIATION rejects transparent images; composite onto solid background
      const imageDataUrl = await new Promise<string>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) return reject(new Error("Canvas not available"));
          ctx.fillStyle = "#f5f5f5";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL("image/jpeg", 0.92));
        };
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = photoUrl;
      });

      const res = await fetch("/api/images/after", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageDataUrl,
          goal: profile.goal,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      if (data.image) {
        onProfileUpdate({ ...profile, goalPhotoDataUrl: data.image });
      }
    } catch (err) {
      console.error("After image error:", err);
      alert(err instanceof Error ? err.message : "Failed to generate after image. Try again.");
    } finally {
      setGoalPhotoLoading(false);
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
        if (w > h) {
          h = (h / w) * MAX_AVATAR_SIZE;
          w = MAX_AVATAR_SIZE;
        } else {
          w = (w / h) * MAX_AVATAR_SIZE;
          h = MAX_AVATAR_SIZE;
        }
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
    <div className="space-y-8 animate-fade-in">
      {/* ── Page header ── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          <label className="relative flex h-14 w-14 sm:h-16 sm:w-16 cursor-pointer group shrink-0 rounded-full" aria-label="Upload profile picture">
            <input
              type="file"
              accept="image/*"
              onChange={handleAvatarUpload}
              className="sr-only"
            />
            <div className="absolute inset-0 rounded-full overflow-hidden border-2 border-[var(--border-soft)] bg-[var(--surface-elevated)] ring-2 ring-transparent group-hover:ring-[var(--accent)]/30 transition-all">
              {profile.avatarDataUrl ? (
                <img src={profile.avatarDataUrl} alt="" className="w-full h-full object-cover" />
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
            <h2 className="text-h4 text-[var(--foreground)]">Welcome back, {profile.name}</h2>
            <p className="section-subtitle mt-0.5">Here&apos;s your progress today</p>
          </div>
        </div>
        <div className="flex gap-1.5">
          {[
            [`${profile.age}`, "age"],
            [`${displayWeightLbs} lbs`, "weight"],
            [`${displayHeight.ft}′${displayHeight.inch}″`, "height"],
          ].map(([val, lbl]) => (
            <span key={lbl} className="badge badge-muted">
              <span className="text-[var(--foreground)] font-medium">{val}</span>
              <span>{lbl}</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── Today at a Glance ── */}
      <div className="card p-6">
        <h3 className="section-title !text-base mb-4">Today at a glance</h3>
        <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
          {/* Left: Budget + macros */}
          <div className="space-y-4">
            <div>
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-xl font-bold tabular-nums">{todaysTotals.calories}</span>
                <span className="text-sm text-[var(--muted)]">
                  of <span className={`font-semibold ${todayAdjustment !== 0 ? "text-[var(--accent)]" : "text-[var(--foreground)]"}`}>{adjustedBudget}</span> cal
                  {todayAdjustment !== 0 && (
                    <span className="text-caption ml-1">({baseBudget} base {todayAdjustment > 0 ? "+" : ""}{todayAdjustment})</span>
                  )}
                </span>
              </div>
              <div className="progress-track !mt-0">
                <div className="progress-fill" style={{ width: `${pct(todaysTotals.calories, adjustedBudget)}%` }} />
              </div>
              <p className="text-caption mt-1 tabular-nums">{Math.max(0, adjustedBudget - todaysTotals.calories)} cal remaining</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(["calories", "protein", "carbs", "fat"] as const).map((key) => (
                <div key={key} className="card-flat rounded-lg px-2.5 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">{key}</p>
                  <p className="text-sm font-bold tabular-nums leading-tight">
                    {key === "calories" ? todaysTotals.calories : `${todaysTotals[key]}g`}
                    <span className="stat-value-dim !text-[10px]"> / {key === "calories" ? targets.calories : `${targets[key]}g`}</span>
                  </p>
                  <div className="progress-track !mt-1 h-1">
                    <div className="progress-fill" style={{ width: `${pct(todaysTotals[key], targets[key])}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between pt-1">
              <button onClick={() => setShowActivityForm(!showActivityForm)} className="btn-secondary text-xs min-h-[32px]">
                {showActivityForm ? "Close" : "+ Log activity"}
              </button>
              {todayActivities.length > 0 && (
                <span className="text-[10px] text-[var(--muted)]">{todayActivities.length} activity entries</span>
              )}
            </div>
          </div>

          {/* Right: Today's workout + diet mini-cards */}
          <div className="space-y-3">
            {plan ? (
              <>
                {/* Today's workout */}
                <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setTodayWorkoutExpanded(!todayWorkoutExpanded)}
                    className="w-full px-3 py-2.5 text-left flex items-center gap-2 hover:bg-[var(--surface-elevated)] transition-colors"
                    aria-expanded={todayWorkoutExpanded}
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent-warm)]/10 text-[var(--accent-warm)]">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                      </svg>
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold">Today&apos;s workout</p>
                      {(() => {
                        const idx = matchWorkoutDay(today);
                        if (idx === null) return <p className="text-[10px] text-[var(--muted)]">Rest day</p>;
                        const w = plan.workoutPlan.weeklyPlan[idx];
                        if (!w) return null;
                        const done = w.exercises.filter((ex) => Boolean(workoutProgress[`${plan.id}:${w.day}:${ex.name}:${ex.sets}:${ex.reps}:${ex.notes ?? ""}`])).length;
                        return <p className="text-[10px] text-[var(--muted)]">{w.focus} · {done}/{w.exercises.length} done</p>;
                      })()}
                    </div>
                    <svg className={`h-4 w-4 text-[var(--muted)] flex-shrink-0 transition-transform ${todayWorkoutExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {todayWorkoutExpanded && plan && (() => {
                    const idx = matchWorkoutDay(today);
                    if (idx === null) return <div className="px-3 pb-3 text-xs text-[var(--muted)]">No workout today. Use the calendar below to view other days.</div>;
                    const w = plan.workoutPlan.weeklyPlan[idx];
                    if (!w) return null;
                    const completed = w.exercises.filter((ex) => Boolean(workoutProgress[`${plan.id}:${w.day}:${ex.name}:${ex.sets}:${ex.reps}:${ex.notes ?? ""}`])).length;
                    const total = w.exercises.length;
                    return (
                      <div className="border-t border-[var(--border-soft)] px-3 py-2 space-y-1.5">
                        <div className="progress-track !mt-0">
                          <div className="progress-fill" style={{ width: `${total > 0 ? Math.round((completed / total) * 100) : 0}%` }} />
                        </div>
                        {w.exercises.slice(0, 8).map((ex, i) => {
                          const key = `${plan.id}:${w.day}:${ex.name}:${ex.sets}:${ex.reps}:${ex.notes ?? ""}`;
                          const isDone = Boolean(workoutProgress[key]);
                          const gifKey = ex.name.toLowerCase().trim();
                          const gif = exerciseGifs[gifKey];
                          const isExpanded = expandedExerciseDemos.has(gifKey);
                          const showGif = typeof gif === "object" && gif.gifUrl && isExpanded;
                          return (
                            <div key={i} className="rounded-md border border-[var(--border-soft)] px-2 py-1.5 space-y-1">
                              <div className="flex items-center gap-2 text-xs">
                                <span className={`flex-shrink-0 h-3.5 w-3.5 rounded-full border-2 ${isDone ? "border-[var(--accent)] bg-[var(--accent)]" : "border-[var(--border)]"}`}>
                                  {isDone && <svg className="h-full w-full text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2}><path d="M2.5 6l2.5 2.5 4.5-4.5" /></svg>}
                                </span>
                                <span className={`flex-1 min-w-0 truncate ${isDone ? "line-through text-[var(--muted)]" : ""}`}>{ex.name}</span>
                                <span className="text-[var(--muted)] tabular-nums">{ex.sets}×{ex.reps}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isExpanded) setExpandedExerciseDemos((prev) => { const n = new Set(prev); n.delete(gifKey); return n; });
                                    else { setExpandedExerciseDemos((prev) => new Set(prev).add(gifKey)); fetchExerciseGif(ex.name); }
                                  }}
                                  className="text-[10px] font-medium text-[var(--accent)] hover:underline flex-shrink-0"
                                >
                                  {gif === "loading" ? "…" : showGif ? "Hide demo" : "Show demo"}
                                </button>
                              </div>
                              {showGif && gif && typeof gif === "object" && gif.gifUrl && (
                                <div className="pl-5 space-y-1">
                                  <img src={gif.gifUrl} alt={ex.name} className="rounded-lg max-h-24 object-contain bg-[var(--surface-elevated)]" />
                                  {gif.targetMuscles?.length ? <p className="text-[10px] text-[var(--muted)]">Target: {gif.targetMuscles.join(", ")}</p> : null}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {total > 8 && <p className="text-[10px] text-[var(--muted)]">+{total - 8} more · see calendar</p>}
                      </div>
                    );
                  })()}
                </div>

                {/* Today's diet */}
                <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setTodayDietExpanded(!todayDietExpanded)}
                    className="w-full px-3 py-2.5 text-left flex items-center gap-2 hover:bg-[var(--surface-elevated)] transition-colors"
                    aria-expanded={todayDietExpanded}
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)]/10 text-[var(--accent)]">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold">Today&apos;s diet</p>
                      {(() => {
                        const logged = meals.filter((m) => m.date === today).length;
                        const idx = matchDietDay(today);
                        if (idx === null) return <p className="text-[10px] text-[var(--muted)]">{logged} meal{logged !== 1 ? "s" : ""} logged</p>;
                        const d = plan.dietPlan.weeklyPlan[idx];
                        const planCal = d?.meals.reduce((s, m) => s + (m.macros?.calories ?? 0), 0) ?? 0;
                        return <p className="text-[10px] text-[var(--muted)]">{logged} logged · plan {planCal} cal</p>;
                      })()}
                    </div>
                    <svg className={`h-4 w-4 text-[var(--muted)] flex-shrink-0 transition-transform ${todayDietExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {todayDietExpanded && plan && (() => {
                    const idx = matchDietDay(today);
                    if (idx === null) return <div className="px-3 pb-3 text-xs text-[var(--muted)]">No plan for today. Use the calendar below.</div>;
                    const d = plan.dietPlan.weeklyPlan[idx];
                    if (!d) return null;
                    const logged = meals.filter((m) => m.date === today);
                    return (
                      <div className="border-t border-[var(--border-soft)] px-3 py-2 space-y-2">
                        {logged.length > 0 && (
                          <div>
                            <p className="text-[10px] font-semibold uppercase text-[var(--muted)] mb-1">Logged</p>
                            {logged.slice(0, 4).map((m) => (
                              <div key={m.id} className="flex justify-between text-xs">
                                <span className="truncate">{m.name}</span>
                                <span className="text-[var(--muted)] tabular-nums">{m.macros.calories} cal</span>
                              </div>
                            ))}
                            {logged.length > 4 && <p className="text-[10px] text-[var(--muted)]">+{logged.length - 4} more</p>}
                          </div>
                        )}
                        <div>
                          <p className="text-[10px] font-semibold uppercase text-[var(--muted)] mb-1">Suggested</p>
                          {d.meals.slice(0, 4).map((m, i) => (
                            <div key={i} className="flex justify-between text-xs">
                              <span className="capitalize text-[var(--muted)]">{m.mealType}</span>
                              <span className="tabular-nums">{m.macros?.calories ?? 0} cal</span>
                            </div>
                          ))}
                          {d.meals.length > 4 && <p className="text-[10px] text-[var(--muted)]">+{d.meals.length - 4} more</p>}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-[var(--border-soft)] bg-[var(--surface-elevated)] px-3 py-6 text-center">
                <p className="text-xs text-[var(--muted)]">Generate a plan to see today&apos;s workout and diet.</p>
              </div>
            )}
          </div>
        </div>

        {/* Collapsible activity log + form */}
        {(todayActivities.length > 0 || showActivityForm) && (
          <div className="mt-4 border-t border-[var(--border-soft)] pt-4">
            {todayActivities.length > 0 && (
              <div className="mb-3">
                <p className="stat-label mb-2">Today&apos;s activity</p>
                <div className="space-y-1.5">
                  {todayActivities.map((a) => (
                    <div key={a.id} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${a.type === "activity" ? "bg-[var(--accent)]" : "bg-[var(--accent-terracotta)]"}`} aria-hidden="true" />
                        <span className={`text-[10px] font-medium uppercase ${a.type === "activity" ? "text-[var(--accent)]" : "text-[var(--accent-terracotta)]"}`}>{a.type === "activity" ? "active" : "rest"}</span>
                        <span>{a.label}</span>
                        <span className="text-caption">{a.durationMinutes} min</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium tabular-nums ${a.calorieAdjustment > 0 ? "text-[var(--accent)]" : "text-[var(--accent-terracotta)]"}`}>{a.calorieAdjustment > 0 ? "+" : ""}{a.calorieAdjustment} cal</span>
                        <button onClick={() => removeActivityEntry(a.id)} className="text-[var(--muted)] hover:text-[var(--accent-terracotta)] text-xs" aria-label={`Remove ${a.label}`}>
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {showActivityForm && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="label text-xs">Add activity</p>
                  <div className="space-y-1.5">
                    {([
                      ["30 min walk", "walking", 30, 130],
                      ["45 min run", "running", 45, 400],
                      ["60 min workout", "workout", 60, 350],
                      ["30 min cycling", "cycling", 30, 250],
                      ["20 min HIIT", "hiit", 20, 220],
                    ] as const).map(([label, cat, mins, cals]) => (
                      <button
                        key={label}
                        onClick={() => addActivityEntry({ id: `act_${Date.now()}`, date: today, type: "activity", label, category: cat, durationMinutes: mins, calorieAdjustment: cals, loggedAt: new Date().toISOString() })}
                        className="w-full flex items-center justify-between rounded-lg bg-[var(--accent)]/5 px-3 py-1.5 text-xs hover:bg-[var(--accent)]/10"
                      >
                        <span>{label}</span>
                        <span className="text-[var(--accent)]">+{cals} cal</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="label text-xs">Log sedentary</p>
                  <div className="space-y-1.5">
                    {([
                      ["2 hr desk work", "desk_work", 120, -50],
                      ["3 hr TV", "watching_tv", 180, -75],
                      ["2 hr gaming", "gaming", 120, -60],
                    ] as const).map(([label, cat, mins, cals]) => (
                      <button
                        key={label}
                        onClick={() => addActivityEntry({ id: `sed_${Date.now()}`, date: today, type: "sedentary", label, category: cat, durationMinutes: mins, calorieAdjustment: cals, loggedAt: new Date().toISOString() })}
                        className="w-full flex items-center justify-between rounded-lg bg-[var(--accent-terracotta)]/5 px-3 py-1.5 text-xs hover:bg-[var(--accent-terracotta)]/10"
                      >
                        <span>{label}</span>
                        <span className="text-[var(--accent-terracotta)]">{cals} cal</span>
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-[var(--muted)] mt-1">Only log unusually sedentary periods.</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Calendar Navigator ── */}
      {plan && (
        <div className="space-y-4">
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
                        <button type="button" onClick={onNavigateToMeals} className="text-[var(--accent)] hover:underline text-[10px] font-medium">
                          Edit plan
                        </button>
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
                        <button type="button" onClick={onNavigateToWorkouts} className="text-[var(--accent)] hover:underline text-[10px] font-medium">
                          Edit plan
                        </button>
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
                          <span className={`badge text-[10px] ${allDone ? "badge-accent" : "badge-muted"}`}>
                            {completed}/{total} done
                          </span>
                        </div>
                        {total > 0 && (
                          <div className="progress-track !mt-0 mb-2">
                            <div className="progress-fill" style={{ width: `${total > 0 ? Math.round((completed / total) * 100) : 0}%` }} />
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
                                    {isDone && (
                                      <svg className="h-full w-full text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2}>
                                        <path d="M2.5 6l2.5 2.5 4.5-4.5" />
                                      </svg>
                                    )}
                                  </span>
                                  <span className={`flex-1 min-w-0 truncate ${isDone ? "line-through text-[var(--muted)]" : "font-medium"}`}>{ex.name}</span>
                                  <span className="text-[var(--muted)] flex-shrink-0 tabular-nums">{ex.sets} x {ex.reps}</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (isExpanded) setExpandedExerciseDemos((prev) => { const n = new Set(prev); n.delete(gifKey); return n; });
                                      else { setExpandedExerciseDemos((prev) => new Set(prev).add(gifKey)); fetchExerciseGif(ex.name); }
                                    }}
                                    className="text-[10px] font-medium text-[var(--accent)] hover:underline flex-shrink-0"
                                  >
                                    {gif === "loading" ? "…" : showGif ? "Hide demo" : "Show demo"}
                                  </button>
                                </div>
                                {showGif && gif && typeof gif === "object" && gif.gifUrl && (
                                  <div className="pl-5 space-y-1">
                                    <img src={gif.gifUrl} alt={ex.name} className="rounded-lg max-h-24 object-contain bg-[var(--surface-elevated)]" />
                                    {gif.targetMuscles?.length ? <p className="text-[10px] text-[var(--muted)]">Target: {gif.targetMuscles.join(", ")}</p> : null}
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
      <div className="card p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="section-title !text-base">Weekly AI Review</h3>
            <p className="section-subtitle">Autonomous agent analyzes meals, wearables &amp; research</p>
          </div>
          <button onClick={handleWeeklyReview} disabled={reviewLoading} className="btn-primary flex-shrink-0">
            {reviewLoading ? "Analyzing..." : "Generate"}
          </button>
        </div>
        {reviewLoading && (
          <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
            <div className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
            Agent running: analyzing meals, checking wearables, researching guidelines...
          </div>
        )}
        {weeklyReview && !reviewLoading && (
          <div className="space-y-3">
            <p className="text-sm leading-relaxed">{weeklyReview.summary}</p>
            {weeklyReview.agentSteps && weeklyReview.agentSteps.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {weeklyReview.agentSteps.map((step, i) => (
                  <span key={i} className="badge badge-accent">{step.tool}</span>
                ))}
              </div>
            )}
            <button onClick={() => setReviewExpanded(!reviewExpanded)} className="btn-ghost !px-0 text-xs text-[var(--accent)]">
              {reviewExpanded ? "Show less" : "Show full review"}
            </button>
            {reviewExpanded && (
              <div className="space-y-4 border-t border-[var(--border-soft)] pt-4 animate-fade-in">
                {weeklyReview.mealAnalysis && (
                  <div>
                    <p className="stat-label mb-1">Meal Analysis</p>
                    <p className="text-sm leading-relaxed">{weeklyReview.mealAnalysis}</p>
                  </div>
                )}
                {weeklyReview.wearableInsights && (
                  <div>
                    <p className="stat-label mb-1">Wearable Insights</p>
                    <p className="text-sm leading-relaxed">{weeklyReview.wearableInsights}</p>
                  </div>
                )}
                {weeklyReview.recommendations && weeklyReview.recommendations.length > 0 && (
                  <div>
                    <p className="stat-label mb-1">Recommendations</p>
                    <ul className="list-disc pl-4 text-sm space-y-1 leading-relaxed">
                      {weeklyReview.recommendations.map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                  </div>
                )}
                <p className="text-caption">
                  Generated {new Date(weeklyReview.createdAt).toLocaleDateString()} via {weeklyReview.agentSteps?.length ?? 0} agent steps
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {wearableData && wearableData.length > 0 && (
        <div className="card p-6">
          <h3 className="section-title !text-base mb-4">Wearable data</h3>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            {wearableData.slice(0, 5).map((d) => (
              <div key={`${d.date}-${d.provider}`} className="card-flat rounded-xl px-4 py-3">
                <p className="text-caption mb-1">{d.date} · {d.provider}</p>
                <p className="text-sm font-medium">
                  {d.steps != null && `${d.steps.toLocaleString()} steps`}
                  {d.sleepScore != null && ` · Sleep ${d.sleepScore}`}
                  {d.readinessScore != null && ` · Ready ${d.readinessScore}`}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Transformation Preview ── */}
      <div className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="section-title !text-base">See your transformation</h3>
            <p className="section-subtitle">
              Upload a full-body photo and generate an AI &quot;after&quot; image based on your goal
            </p>
          </div>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          {profile.fullBodyPhotoDataUrl ? (
            <div className="flex flex-col items-center">
              <div className="relative w-full aspect-[3/4] max-h-64 rounded-xl overflow-hidden border border-[var(--border-soft)] bg-[var(--surface-elevated)]" style={{ minHeight: 180 }}>
                <img src={profile.fullBodyPhotoDataUrl} alt="You now" className="w-full h-full object-cover" />
              </div>
              <p className="mt-2 text-xs font-medium text-[var(--muted)]">You now</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--border-soft)] bg-[var(--surface-elevated)] py-10 px-4 text-center min-h-[180px]">
              <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent)]/10 text-[var(--accent)]">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-[var(--foreground)]">Add your photo</p>
              <p className="mt-1 text-xs text-[var(--muted)]">Upload full-body photo to generate after image</p>
              <div className="mt-3 flex flex-wrap gap-2 justify-center">
                <label className="btn-primary !text-xs cursor-pointer">
                  <input type="file" accept="image/*" onChange={handleFullBodyPhotoUpload} className="sr-only" />
                  {fullBodyPhotoLoading ? "Processing..." : "Upload photo"}
                </label>
              </div>
            </div>
          )}
          {profile.goalPhotoDataUrl ? (
            <div className="flex flex-col items-center">
              <div className="relative w-full aspect-[3/4] max-h-64 rounded-xl overflow-hidden border border-[var(--accent)]/40 bg-[var(--accent)]/5" style={{ minHeight: 180 }}>
                <img src={profile.goalPhotoDataUrl} alt="Your goal" className="w-full h-full object-cover" />
                <div className="absolute top-2 right-2 rounded-full bg-[var(--accent)]/90 px-2 py-0.5 text-[10px] font-semibold text-white">Goal</div>
              </div>
              <p className="mt-2 text-xs font-medium text-[var(--muted)]">Your goal (AI-generated)</p>
            </div>
          ) : profile.fullBodyPhotoDataUrl ? (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--accent)]/40 bg-[var(--accent)]/5 py-10 px-4 text-center min-h-[180px]">
              <p className="text-sm font-medium text-[var(--foreground)]">Generate &quot;after&quot; image</p>
              <p className="mt-1 text-xs text-[var(--muted)]">AI will transform your photo based on goal: {profile.goal.replace(/_/g, " ")}</p>
              <button onClick={handleGenerateAfterImage} disabled={goalPhotoLoading} className="btn-primary mt-3 !text-xs">
                {goalPhotoLoading ? "Generating..." : "Generate after image"}
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--border-soft)] bg-[var(--surface-elevated)] py-10 px-4 text-center min-h-[180px]">
              <p className="text-sm font-medium text-[var(--foreground)]">Upload a photo</p>
              <p className="mt-1 text-xs text-[var(--muted)]">Add a full-body photo to generate your AI &quot;after&quot; image</p>
              <p className="mt-2 text-xs text-[var(--muted)]">Goal: {profile.goal.replace(/_/g, " ")}</p>
            </div>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="btn-secondary !text-xs cursor-pointer">
            <input type="file" accept="image/*" onChange={handleFullBodyPhotoUpload} className="sr-only" />
            {fullBodyPhotoLoading ? "Processing..." : profile.fullBodyPhotoDataUrl ? "Replace body photo" : "Upload full body photo"}
          </label>
          {profile.fullBodyPhotoDataUrl && profile.goalPhotoDataUrl && (
            <button onClick={handleGenerateAfterImage} disabled={goalPhotoLoading} className="btn-secondary !text-xs">
              {goalPhotoLoading ? "Regenerating..." : "Regenerate after"}
            </button>
          )}
          {profile.fullBodyPhotoDataUrl && (
            <button onClick={() => onProfileUpdate({ ...profile, fullBodyPhotoDataUrl: undefined, goalPhotoDataUrl: undefined })} className="text-xs text-[var(--muted)] hover:text-[var(--accent-terracotta)]">
              Remove photo
            </button>
          )}
          <span className="text-caption text-[var(--muted)]">
            {profile.fullBodyPhotoDataUrl && profile.goalPhotoDataUrl ? "Right: AI-generated after image based on your goal" : !profile.fullBodyPhotoDataUrl && `Goal: ${profile.goal.replace(/_/g, " ")}`}
          </span>
        </div>
      </div>

      <div className="pt-6 mt-2 border-t border-[var(--border-soft)]">
        <button onClick={onReset} className="btn-ghost text-xs text-[var(--muted)]">
          Start over with new profile
        </button>
      </div>
    </div>
  );
}
