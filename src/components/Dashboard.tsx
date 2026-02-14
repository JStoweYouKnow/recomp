"use client";

import { useState, useEffect } from "react";
import { getWorkoutProgress, getWeeklyReview, saveWeeklyReview, getActivityLog, saveActivityLog } from "@/lib/storage";
import { segmentPersonFromPhoto } from "@/lib/body-segmentation";
import type { UserProfile, FitnessPlan, MealEntry, Macros, WearableDaySummary, WeeklyReview, ActivityLogEntry, WorkoutLocation, WorkoutEquipment } from "@/lib/types";

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
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoStatus, setVideoStatus] = useState<{ status?: string; invocationArn?: string; videoUrl?: string } | null>(null);
  const [videoThinkingStep, setVideoThinkingStep] = useState(0);
  const [videoExerciseSelect, setVideoExerciseSelect] = useState<string>("");
  const workoutProgress = getWorkoutProgress();
  const [dashExpandedWorkout, setDashExpandedWorkout] = useState<number | null>(null);
  const [dashExpandedDiet, setDashExpandedDiet] = useState<number | null>(null);
  const [dashEditingDiet, setDashEditingDiet] = useState<number | null>(null);
  const [workoutPrefsEditing, setWorkoutPrefsEditing] = useState(false);

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

  /* ── Video generation: thinking message cycling ── */
  useEffect(() => {
    if (videoStatus?.status !== "InProgress") return;
    const id = setInterval(() => setVideoThinkingStep((s) => s + 1), 3800);
    return () => clearInterval(id);
  }, [videoStatus?.status]);

  /* ── Video generation: poll when InProgress ── */
  useEffect(() => {
    if (videoStatus?.status !== "InProgress" || !videoStatus.invocationArn) return;
    const poll = async () => {
      try {
        const res = await fetch("/api/video/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "poll", invocationArn: videoStatus.invocationArn }),
        });
        const data = await res.json();
        if (data.status === "Completed") {
          setVideoStatus((v) => (v ? { ...v, status: "Completed", videoUrl: data.videoUrl ?? undefined } : null));
          return;
        }
        if (data.status === "Failed") {
          setVideoStatus((v) => (v ? { ...v, status: `Failed: ${data.failureMessage ?? "Unknown"}` } : null));
          return;
        }
      } catch {
        // keep polling
      }
    };
    const id = setInterval(poll, 12000); // every 12s
    poll(); // immediate first poll
    return () => clearInterval(id);
  }, [videoStatus?.status, videoStatus?.invocationArn]);

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

  const weekExercises = plan
    ? [...new Set(plan.workoutPlan.weeklyPlan.flatMap((d) => d.exercises.map((e) => e.name).filter(Boolean)))]
    : [];
  const selectedExercise = videoExerciseSelect && weekExercises.includes(videoExerciseSelect)
    ? videoExerciseSelect
    : weekExercises[0] ?? null;

  const handleGenerateWorkoutDemo = async () => {
    if (!plan) return;
    const exerciseName = selectedExercise ?? "bicep curl";
    const prompt = `Anime style. Person doing ${exerciseName}. One complete rep, full body visible.`;

    setVideoLoading(true);
    setVideoStatus(null);
    setVideoThinkingStep(0);
    try {
      const res = await fetch("/api/video/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (res.status === 503) {
        setVideoStatus({ status: "S3 bucket not configured — set NOVA_REEL_S3_BUCKET in .env to enable video generation." });
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Unable to start demo generation");
      setVideoStatus({ status: "InProgress", invocationArn: data.invocationArn });
    } catch (err) {
      setVideoStatus({ status: err instanceof Error ? err.message : "Error" });
    } finally {
      setVideoLoading(false);
    }
  };

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
            <h2 className="section-title !text-xl">Welcome back, {profile.name}</h2>
            <p className="section-subtitle">Here&apos;s your progress today</p>
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

      {/* ── Caloric Budget ── */}
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="section-title !text-base">Today&apos;s caloric budget</h3>
            <p className="section-subtitle">
              {todayAdjustment === 0
                ? "Log activity to earn more calories, or track sedentary time"
                : todayAdjustment > 0
                  ? `+${todayAdjustment} cal earned from activity`
                  : `${todayAdjustment} cal from sedentary time`}
            </p>
          </div>
          <button onClick={() => setShowActivityForm(!showActivityForm)} className="btn-secondary !text-xs">
            {showActivityForm ? "Close" : "+ Log activity"}
          </button>
        </div>

        {/* Budget bar */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1">
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-2xl font-bold tabular-nums">{todaysTotals.calories}</span>
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
            <p className="text-caption mt-1 tabular-nums">
              {Math.max(0, adjustedBudget - todaysTotals.calories)} cal remaining
            </p>
          </div>
        </div>

        {/* Macro row */}
        <div className="grid gap-3 grid-cols-3">
          {(["protein", "carbs", "fat"] as const).map((key) => (
            <div key={key} className="card-flat rounded-xl px-3 py-2.5">
              <p className="stat-label">{key}</p>
              <p className="text-base font-bold tabular-nums">
                {todaysTotals[key]}<span className="stat-value-dim !text-xs">g</span>
                <span className="stat-value-dim !text-xs"> / {targets[key]}g</span>
              </p>
              <div className="progress-track !mt-1">
                <div className="progress-fill" style={{ width: `${pct(todaysTotals[key], targets[key])}%` }} />
              </div>
            </div>
          ))}
        </div>

        {/* Today's activity log */}
        {todayActivities.length > 0 && (
          <div className="mt-4 border-t border-[var(--border-soft)] pt-3">
            <p className="stat-label mb-2">Today&apos;s activity</p>
            <div className="space-y-1.5">
              {todayActivities.map((a) => (
                <div key={a.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${a.type === "activity" ? "bg-[var(--accent)]" : "bg-[var(--accent-terracotta)]"}`} />
                    <span>{a.label}</span>
                    <span className="text-caption">{a.durationMinutes} min</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium tabular-nums ${a.calorieAdjustment > 0 ? "text-[var(--accent)]" : "text-[var(--accent-terracotta)]"}`}>
                      {a.calorieAdjustment > 0 ? "+" : ""}{a.calorieAdjustment} cal
                    </span>
                    <button onClick={() => removeActivityEntry(a.id)} className="text-[var(--muted)] hover:text-[var(--accent-terracotta)] text-xs">x</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Activity form */}
        {showActivityForm && (
          <div className="mt-4 border-t border-[var(--border-soft)] pt-4 animate-fade-in">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="label">Add exercise / activity</p>
                <div className="space-y-2">
                  {([
                    ["30 min walk", "walking", 30, 130],
                    ["45 min run", "running", 45, 400],
                    ["60 min workout", "workout", 60, 350],
                    ["30 min cycling", "cycling", 30, 250],
                    ["30 min swim", "swimming", 30, 300],
                    ["20 min HIIT", "hiit", 20, 220],
                    ["30 min yoga", "yoga", 30, 120],
                  ] as const).map(([label, cat, mins, cals]) => (
                    <button
                      key={label}
                      onClick={() => {
                        addActivityEntry({
                          id: `act_${Date.now()}`,
                          date: today,
                          type: "activity",
                          label,
                          category: cat,
                          durationMinutes: mins,
                          calorieAdjustment: cals,
                          loggedAt: new Date().toISOString(),
                        });
                      }}
                      className="w-full flex items-center justify-between rounded-lg bg-[var(--accent)]/5 px-3 py-2 text-sm hover:bg-[var(--accent)]/10 transition-colors"
                    >
                      <span>{label}</span>
                      <span className="text-xs font-medium text-[var(--accent)]">+{cals} cal</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="label">Log sedentary time</p>
                <div className="space-y-2">
                  {([
                    ["2 hr desk work", "desk_work", 120, -50],
                    ["3 hr watching TV", "watching_tv", 180, -75],
                    ["2 hr gaming", "gaming", 120, -60],
                    ["1 hr nap", "nap", 60, -30],
                    ["3 hr travel", "travel", 180, -40],
                  ] as const).map(([label, cat, mins, cals]) => (
                    <button
                      key={label}
                      onClick={() => {
                        addActivityEntry({
                          id: `sed_${Date.now()}`,
                          date: today,
                          type: "sedentary",
                          label,
                          category: cat,
                          durationMinutes: mins,
                          calorieAdjustment: cals,
                          loggedAt: new Date().toISOString(),
                        });
                      }}
                      className="w-full flex items-center justify-between rounded-lg bg-[var(--accent-terracotta)]/5 px-3 py-2 text-sm hover:bg-[var(--accent-terracotta)]/10 transition-colors"
                    >
                      <span>{label}</span>
                      <span className="text-xs font-medium text-[var(--accent-terracotta)]">{cals} cal</span>
                    </button>
                  ))}
                </div>
                <p className="text-caption mt-2 italic">
                  Sedentary deductions assume your base budget already accounts for your activity level. Only log unusually sedentary periods.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

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
          {/* Right: AI-generated after image or placeholder */}
          {profile.goalPhotoDataUrl ? (
            <div className="flex flex-col items-center">
              <div
                className={`relative w-full aspect-[3/4] max-h-64 rounded-xl overflow-hidden border border-[var(--accent)]/40 bg-[var(--accent)]/5`}
                style={{ minHeight: 180 }}
              >
                <img
                  src={profile.goalPhotoDataUrl}
                  alt="Your goal"
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-2 right-2 rounded-full bg-[var(--accent)]/90 px-2 py-0.5 text-[10px] font-semibold text-white">
                  Goal
                </div>
              </div>
              <p className="mt-2 text-xs font-medium text-[var(--muted)]">Your goal (AI-generated)</p>
            </div>
          ) : profile.fullBodyPhotoDataUrl ? (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--accent)]/40 bg-[var(--accent)]/5 py-10 px-4 text-center min-h-[180px]">
              <p className="text-sm font-medium text-[var(--foreground)]">Generate &quot;after&quot; image</p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                AI will transform your photo based on goal: {profile.goal.replace(/_/g, " ")}
              </p>
              <button
                onClick={handleGenerateAfterImage}
                disabled={goalPhotoLoading}
                className="btn-primary mt-3 !text-xs"
              >
                {goalPhotoLoading ? "Generating..." : "Generate after image"}
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--border-soft)] bg-[var(--surface-elevated)] py-10 px-4 text-center min-h-[180px]">
              <p className="text-sm font-medium text-[var(--foreground)]">Upload a photo</p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Add a full-body photo to generate your AI &quot;after&quot; image
              </p>
              <p className="mt-2 text-xs text-[var(--muted)]">Goal: {profile.goal.replace(/_/g, " ")}</p>
            </div>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="btn-secondary !text-xs cursor-pointer">
            <input
              type="file"
              accept="image/*"
              onChange={handleFullBodyPhotoUpload}
              className="sr-only"
            />
            {fullBodyPhotoLoading ? "Processing..." : profile.fullBodyPhotoDataUrl ? "Replace body photo" : "Upload full body photo"}
          </label>
          {profile.fullBodyPhotoDataUrl && profile.goalPhotoDataUrl && (
            <button
              onClick={handleGenerateAfterImage}
              disabled={goalPhotoLoading}
              className="btn-secondary !text-xs"
            >
              {goalPhotoLoading ? "Regenerating..." : "Regenerate after"}
            </button>
          )}
          {profile.fullBodyPhotoDataUrl && (
            <button
              onClick={() => onProfileUpdate({ ...profile, fullBodyPhotoDataUrl: undefined, goalPhotoDataUrl: undefined })}
              className="text-xs text-[var(--muted)] hover:text-[var(--accent-terracotta)]"
            >
              Remove photo
            </button>
          )}
          <span className="text-caption text-[var(--muted)]">
            {profile.fullBodyPhotoDataUrl && profile.goalPhotoDataUrl
              ? "Right: AI-generated after image based on your goal"
              : !profile.fullBodyPhotoDataUrl && `Goal: ${profile.goal.replace(/_/g, " ")}`}
          </span>
        </div>
      </div>

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

      {plan && (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="card p-6">
            <div className="flex items-baseline justify-between mb-4">
              <h3 className="section-title !text-base">This week&apos;s diet</h3>
              <div className="text-right">
                <span className="text-caption">Budget: <span className={`font-semibold ${todayAdjustment !== 0 ? "text-[var(--accent)]" : "text-[var(--foreground)]"}`}>{adjustedBudget}</span> cal/day</span>
                {todayAdjustment !== 0 && <p className="text-caption">{baseBudget} base {todayAdjustment > 0 ? "+" : ""}{todayAdjustment}</p>}
              </div>
            </div>
            <div className="space-y-2">
              {plan.dietPlan.weeklyPlan.map((d, dIdx) => {
                const dayTotal = d.meals.reduce((s, m) => s + (m.macros?.calories ?? 0), 0);
                const dayProtein = d.meals.reduce((s, m) => s + (m.macros?.protein ?? 0), 0);
                const isOpen = dashExpandedDiet === dIdx;
                const isEditing = dashEditingDiet === dIdx;
                const withinBudget = dayTotal <= adjustedBudget;
                const remaining = adjustedBudget - dayTotal;
                const dayCarbs = d.meals.reduce((s, m) => s + (m.macros?.carbs ?? 0), 0);
                const dayFat = d.meals.reduce((s, m) => s + (m.macros?.fat ?? 0), 0);
                /* per-meal calorie target = budget split evenly by meal count */
                const mealBudget = d.meals.length > 0 ? Math.round(adjustedBudget / d.meals.length) : adjustedBudget;
                return (
                  <div key={`diet-${d.day}-${dIdx}`} className="rounded-lg border border-[var(--border-soft)] overflow-hidden transition-all">
                    <button
                      type="button"
                      onClick={() => {
                        setDashExpandedDiet(isOpen ? null : dIdx);
                        if (isOpen) setDashEditingDiet(null);
                      }}
                      className="w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-[var(--surface-elevated)] transition-colors"
                      aria-expanded={isOpen}
                    >
                      <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${withinBudget ? "bg-[var(--accent)]/10 text-[var(--accent)]" : "bg-[var(--accent-warm)]/10 text-[var(--accent-warm)]"}`}>
                        {d.day.replace(/^Day\s*/i, "").slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{d.day}</p>
                        <p className="text-xs text-[var(--muted)] truncate">
                          {d.meals.map((m) => m.mealType).join(", ")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {dayTotal > 0 && (
                          <span className={`badge ${withinBudget ? "badge-accent" : "badge-warm"}`}>
                            {dayTotal} cal
                          </span>
                        )}
                        <svg className={`h-3.5 w-3.5 text-[var(--muted)] transition-transform flex-shrink-0 ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>
                    {isOpen && (
                      <div className="border-t border-[var(--border-soft)] px-4 py-3 space-y-2 bg-[var(--surface)] animate-fade-in">
                        {/* Day macro summary + remaining */}
                        <div className="flex flex-wrap items-center gap-3 text-xs mb-1">
                          <span><span className="font-semibold">{dayTotal}</span> / {adjustedBudget} cal</span>
                          <span className="text-[var(--border)]">·</span>
                          <span><span className="font-semibold">{dayProtein}</span>g P</span>
                          <span className="text-[var(--border)]">·</span>
                          <span><span className="font-semibold">{dayCarbs}</span>g C</span>
                          <span className="text-[var(--border)]">·</span>
                          <span><span className="font-semibold">{dayFat}</span>g F</span>
                          <span className={`ml-auto font-medium ${remaining >= 0 ? "text-[var(--accent)]" : "text-[var(--accent-terracotta)]"}`}>
                            {remaining >= 0 ? `${remaining} cal remaining` : `${Math.abs(remaining)} cal over`}
                          </span>
                        </div>
                        {/* Budget bar */}
                        <div className="progress-track h-1.5">
                          <div
                            className="progress-fill h-full transition-all"
                            style={{ width: `${Math.min(100, adjustedBudget > 0 ? (dayTotal / adjustedBudget) * 100 : 0)}%`, background: withinBudget ? "var(--accent)" : "var(--accent-terracotta)" }}
                          />
                        </div>
                        {/* Action bar */}
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); setDashEditingDiet(isEditing ? null : dIdx); }}
                            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${isEditing ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-elevated)] text-[var(--muted)] hover:text-[var(--foreground)]"}`}
                          >
                            {isEditing ? "Done editing" : "Edit meals"}
                          </button>
                          {isEditing && (
                            <button
                              onClick={(e) => { e.stopPropagation(); addDietMeal(dIdx); }}
                              className="rounded-lg px-3 py-1.5 text-xs font-medium bg-[var(--surface-elevated)] text-[var(--muted)] hover:text-[var(--foreground)] transition"
                            >
                              + Add meal
                            </button>
                          )}
                          <span className="ml-auto text-[10px] text-[var(--muted)]">~{mealBudget} cal/meal target</span>
                        </div>
                        {/* Individual meals */}
                        {d.meals.map((m, mIdx) => {
                          const mealCals = m.macros?.calories ?? 0;
                          const overMealBudget = mealCals > mealBudget + 50; // 50 cal grace
                          return (
                            <div key={`${d.day}-meal-${mIdx}`} className="rounded-md px-3 py-2 bg-[var(--surface-elevated)]">
                              {isEditing ? (
                                /* ── Edit mode ── */
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2">
                                    <select
                                      value={m.mealType}
                                      onChange={(e) => updateDietMeal(dIdx, mIdx, { mealType: e.target.value })}
                                      className="input-base rounded px-2 py-1 text-sm capitalize"
                                    >
                                      <option value="breakfast">Breakfast</option>
                                      <option value="lunch">Lunch</option>
                                      <option value="dinner">Dinner</option>
                                      <option value="snack">Snack</option>
                                    </select>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); removeDietMeal(dIdx, mIdx); }}
                                      className="ml-auto text-xs text-[var(--accent-terracotta)] hover:underline"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                  <input
                                    value={m.description}
                                    onChange={(e) => updateDietMeal(dIdx, mIdx, { description: e.target.value })}
                                    placeholder="Describe the meal (e.g. Grilled chicken breast with brown rice)"
                                    className="input-base rounded px-2 py-1.5 text-sm w-full"
                                  />
                                  <div className="grid grid-cols-4 gap-2">
                                    <div>
                                      <label className="text-[10px] text-[var(--muted)] uppercase tracking-wide">Calories</label>
                                      <input
                                        type="number"
                                        min={0}
                                        value={m.macros?.calories ?? 0}
                                        onChange={(e) => updateDietMealMacro(dIdx, mIdx, "calories", e.target.value)}
                                        className="input-base rounded px-2 py-1 text-sm w-full tabular-nums"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] text-[var(--muted)] uppercase tracking-wide">Protein</label>
                                      <input
                                        type="number"
                                        min={0}
                                        value={m.macros?.protein ?? 0}
                                        onChange={(e) => updateDietMealMacro(dIdx, mIdx, "protein", e.target.value)}
                                        className="input-base rounded px-2 py-1 text-sm w-full tabular-nums"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] text-[var(--muted)] uppercase tracking-wide">Carbs</label>
                                      <input
                                        type="number"
                                        min={0}
                                        value={m.macros?.carbs ?? 0}
                                        onChange={(e) => updateDietMealMacro(dIdx, mIdx, "carbs", e.target.value)}
                                        className="input-base rounded px-2 py-1 text-sm w-full tabular-nums"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] text-[var(--muted)] uppercase tracking-wide">Fat</label>
                                      <input
                                        type="number"
                                        min={0}
                                        value={m.macros?.fat ?? 0}
                                        onChange={(e) => updateDietMealMacro(dIdx, mIdx, "fat", e.target.value)}
                                        className="input-base rounded px-2 py-1 text-sm w-full tabular-nums"
                                      />
                                    </div>
                                  </div>
                                  <p className="text-[10px] text-[var(--muted)]">Target ~{mealBudget} cal for this meal</p>
                                </div>
                              ) : (
                                /* ── Read mode ── */
                                <>
                                  <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium capitalize">{m.mealType}</span>
                                    {m.macros && m.macros.calories > 0 && (
                                      <div className="flex items-center gap-2 text-xs tabular-nums">
                                        <span className={`font-semibold ${overMealBudget ? "text-[var(--accent-terracotta)]" : ""}`}>{m.macros.calories} cal</span>
                                        <span className="text-[var(--muted)]">{m.macros.protein}g P · {m.macros.carbs}g C · {m.macros.fat}g F</span>
                                      </div>
                                    )}
                                  </div>
                                  {m.description && (
                                    <p className="mt-1 text-xs text-[var(--muted)] leading-relaxed">{m.description}</p>
                                  )}
                                  {m.macros && m.macros.calories > 0 && (
                                    <div className="mt-1.5 progress-track h-1">
                                      <div
                                        className="progress-fill h-full transition-all"
                                        style={{ width: `${Math.min(100, mealBudget > 0 ? (m.macros.calories / mealBudget) * 100 : 0)}%`, background: overMealBudget ? "var(--accent-terracotta)" : "var(--accent)" }}
                                      />
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          );
                        })}
                        {d.meals.length === 0 && (
                          <div className="text-center py-3">
                            <p className="text-xs text-[var(--muted)] mb-2">No meals planned.</p>
                            <button
                              onClick={(e) => { e.stopPropagation(); addDietMeal(dIdx); setDashEditingDiet(dIdx); }}
                              className="btn-secondary !text-xs"
                            >
                              + Add first meal
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {plan.dietPlan.tips.length > 0 && (
              <p className="mt-4 text-caption italic">{plan.dietPlan.tips[0]}</p>
            )}
            <div className="mt-4 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={groceryStore}
                  onChange={(e) => setGroceryStore(e.target.value as "fresh" | "wholefoods" | "amazon")}
                  className="input-base rounded px-2 py-1 text-xs"
                >
                  <option value="fresh">Amazon Fresh</option>
                  <option value="wholefoods">Whole Foods</option>
                  <option value="amazon">Amazon.com</option>
                </select>
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={groceryAddToCart}
                    onChange={(e) => setGroceryAddToCart(e.target.checked)}
                    className="rounded border-[var(--border)]"
                  />
                  Add to cart
                </label>
              </div>
              {groceryAddToCart && (
                <p className="text-[10px] text-[var(--muted)]">
                  Items will be added to your Amazon cart. One-time: run <code className="text-[9px] bg-[var(--surface-elevated)] px-1 rounded">setup_amazon_login.py</code> (see README). Uses up to 2 items.
                </p>
              )}
              <button
                onClick={handleFindIngredients}
                disabled={groceryLoading}
                className="btn-secondary !text-xs"
              >
                {groceryLoading ? "Preparing grocery shortlist..." : "Build grocery shortlist"}
              </button>
              <p className="text-[10px] text-[var(--muted)] mt-1">Nova Act automation. Requires <code className="bg-[var(--surface-elevated)] px-1 rounded">pip install nova-act</code>.</p>
              {groceryError && <p className="mt-2 text-xs text-[var(--accent-terracotta)]">{groceryError}</p>}
              {groceryResults && groceryResults.length > 0 && (
                <div className="mt-2 max-h-32 space-y-1 overflow-y-auto rounded-lg border border-[var(--border-soft)] p-2">
                  {groceryResults.slice(0, 6).map((r, i) => (
                    <div key={`${r.searchTerm}-${i}`} className="flex items-center justify-between gap-2 text-xs">
                      <span className="min-w-0 truncate">{r.searchTerm}</span>
                      <span className={`flex-shrink-0 ${r.found ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}>
                        {r.found ? (r.product?.price || "Found") : "Not found"}
                        {r.addedToCart !== undefined && (
                          r.addedToCart ? " · In cart" : (r.addToCartError ? ` · ${r.addToCartError.slice(0, 30)}…` : " · Cart skipped")
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="card rounded-xl p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h3 className="text-lg font-semibold">This week&apos;s workouts</h3>
              <div className="flex items-center gap-2">
                {workoutPrefsEditing ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setWorkoutPrefsEditing(false)}
                      className="btn-ghost !text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => setWorkoutPrefsEditing(false)}
                      className="btn-secondary !text-xs"
                    >
                      Done
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setWorkoutPrefsEditing(true)}
                    className="btn-ghost !text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
                  >
                    Workout prefs
                  </button>
                )}
              </div>
            </div>
            {workoutPrefsEditing ? (
              <div className="mb-4 rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] p-4 space-y-3">
                <div>
                  <label className="label">Where you work out</label>
                  <select
                    value={profile.workoutLocation ?? "gym"}
                    onChange={(e) => onProfileUpdate({ ...profile, workoutLocation: e.target.value as WorkoutLocation })}
                    className="input-base w-full max-w-xs"
                  >
                    <option value="home">Home</option>
                    <option value="gym">Gym</option>
                    <option value="outside">Outside</option>
                  </select>
                </div>
                <div>
                  <label className="label">Equipment</label>
                  <div className="flex flex-wrap gap-2">
                    {DASHBOARD_EQUIPMENT_OPTIONS.map(({ value, label }) => (
                      <label key={value} className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={(profile.workoutEquipment ?? []).includes(value)}
                          onChange={() => {
                            const curr = profile.workoutEquipment ?? [];
                            const next = curr.includes(value) ? curr.filter((e) => e !== value) : [...curr, value];
                            onProfileUpdate({ ...profile, workoutEquipment: next });
                          }}
                          className="rounded border-[var(--border)]"
                        />
                        <span className="text-sm">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setWorkoutPrefsEditing(false); onRegeneratePlan(); }}
                  disabled={planRegenerating}
                  className="btn-secondary !text-xs"
                >
                  {planRegenerating ? "Regenerating..." : "Apply and regenerate plan"}
                </button>
              </div>
            ) : (
              <p className="text-xs text-[var(--muted)] mb-3">
                {profile.workoutLocation ?? "Gym"}
                {typeof profile.workoutDaysPerWeek === "number" && ` · ${profile.workoutDaysPerWeek} days/week`}
                {profile.workoutTimeframe && profile.workoutTimeframe !== "flexible" && ` · ${profile.workoutTimeframe}`}
                {" · "}
                {(profile.workoutEquipment ?? []).length > 0
                  ? (profile.workoutEquipment ?? []).map((e) => e.replace(/_/g, " ")).join(", ")
                  : "General equipment"}
              </p>
            )}
            <div className="space-y-2">
              {plan.workoutPlan.weeklyPlan.map((d, dIdx) => {
                const total = d.exercises.length;
                const completed = d.exercises.filter((e) => {
                  const key = `${plan.id}:${d.day}:${e.name}:${e.sets}:${e.reps}:${e.notes ?? ""}`;
                  return Boolean(workoutProgress[key]);
                }).length;
                const done = total > 0 && completed === total;
                const isOpen = dashExpandedWorkout === dIdx;
                return (
                  <div key={`${d.day}-${dIdx}`} className="rounded-lg border border-[var(--border-soft)] overflow-hidden transition-all">
                    <button
                      type="button"
                      onClick={() => setDashExpandedWorkout(isOpen ? null : dIdx)}
                      className="w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-[var(--surface-elevated)] transition-colors"
                      aria-expanded={isOpen}
                    >
                      <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${done ? "bg-[var(--accent)]/15 text-[var(--accent)]" : "bg-[var(--surface-elevated)] text-[var(--foreground)]"}`}>
                        {done ? "✓" : d.day.replace(/^Day\s*/i, "").slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm truncate">{d.day}</p>
                          <span className="text-xs text-[var(--accent)] font-medium">{d.focus}</span>
                        </div>
                        <p className="text-xs text-[var(--muted)] truncate">
                          {d.exercises.slice(0, 3).map((e) => e.name).join(", ")}
                          {total > 3 ? ` +${total - 3}` : ""}
                        </p>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium flex-shrink-0 ${done ? "bg-[var(--accent)]/15 text-[var(--accent)]" : "bg-[var(--surface-elevated)] text-[var(--muted)]"}`}>
                        {completed}/{total}
                      </span>
                      <svg className={`h-3.5 w-3.5 text-[var(--muted)] transition-transform flex-shrink-0 ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {isOpen && (
                      <div className="border-t border-[var(--border-soft)] px-4 py-3 space-y-2 bg-[var(--surface)]">
                        {d.exercises.map((e, eIdx) => {
                          const key = `${plan.id}:${d.day}:${e.name}:${e.sets}:${e.reps}:${e.notes ?? ""}`;
                          const isDone = Boolean(workoutProgress[key]);
                          const restMatch = e.notes?.match(/rest[:\s]*(\d+[\s-]*\d*\s*(?:sec|s|min|m|seconds|minutes)?)/i);
                          const restTime = restMatch ? restMatch[1].trim() : null;
                          const otherNotes = e.notes?.replace(/rest[:\s]*\d+[\s-]*\d*\s*(?:sec|s|min|m|seconds|minutes)?/i, "").replace(/^[,\s|]+|[,\s|]+$/g, "").trim();
                          return (
                            <div key={`${e.name}-${eIdx}`} className={`rounded-md px-3 py-2 text-sm ${isDone ? "bg-[var(--accent)]/5" : "bg-[var(--surface-elevated)]"}`}>
                              <div className="flex items-center gap-2">
                                <span className={`${isDone ? "text-[var(--accent)] line-through" : "text-[var(--foreground)]"} font-medium`}>
                                  {e.name}
                                </span>
                                {isDone && <span className="text-[10px] text-[var(--accent)]">✓</span>}
                              </div>
                              <div className="mt-1 flex flex-wrap gap-2">
                                <span className="inline-flex items-center gap-1 text-xs">
                                  <span className="font-semibold">{e.sets}</span>
                                  <span className="text-[var(--muted)]">sets</span>
                                </span>
                                <span className="text-[var(--border)] text-xs">·</span>
                                <span className="inline-flex items-center gap-1 text-xs">
                                  <span className="font-semibold">{e.reps}</span>
                                  <span className="text-[var(--muted)]">reps</span>
                                </span>
                                {restTime && (
                                  <>
                                    <span className="text-[var(--border)] text-xs">·</span>
                                    <span className="inline-flex items-center gap-1 text-xs text-[var(--accent-warm)]">
                                      <span className="font-semibold">{restTime}</span>
                                      <span>rest</span>
                                    </span>
                                  </>
                                )}
                              </div>
                              {otherNotes && (
                                <p className="mt-1 text-[10px] text-[var(--muted)] italic">{otherNotes}</p>
                              )}
                            </div>
                          );
                        })}
                        {d.exercises.length === 0 && (
                          <p className="text-xs text-[var(--muted)] py-2">No exercises scheduled.</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {plan.workoutPlan.tips.length > 0 && (
              <p className="mt-4 text-sm text-[var(--muted)]">{plan.workoutPlan.tips[0]}</p>
            )}
            <div className="mt-4">
              <div className="flex flex-wrap items-center gap-2">
                {weekExercises.length > 0 ? (
                  <select
                    value={selectedExercise ?? ""}
                    onChange={(e) => setVideoExerciseSelect(e.target.value)}
                    disabled={videoLoading || videoStatus?.status === "InProgress"}
                    className="input-base text-sm py-1.5 px-2 max-w-[200px]"
                  >
                    {weekExercises.map((ex) => (
                      <option key={ex} value={ex}>{ex}</option>
                    ))}
                  </select>
                ) : null}
                <button
                  onClick={handleGenerateWorkoutDemo}
                  disabled={videoLoading || videoStatus?.status === "InProgress"}
                  className="btn-secondary px-3 py-1 text-sm disabled:opacity-50"
                >
                  {videoLoading ? "Starting..." : videoStatus?.status === "InProgress" ? "Generating..." : "Generate form demo clip"}
                </button>
              </div>
              {videoStatus && (
                <div className="mt-2 space-y-2">
                  {videoStatus.status === "InProgress" ? (
                    <div className="animate-thinking-pulse rounded-xl border border-[var(--border-soft)] bg-[var(--surface-elevated)] px-4 py-3">
                      <p className="text-sm text-[var(--foreground)]">
                        {[
                          "Analyzing the exercise",
                          "Setting up the scene",
                          "Generating motion",
                          "Rendering frames",
                          "Finalizing the clip",
                        ][videoThinkingStep % 5]}
                        <span className="thinking-dots">
                          <span className="thinking-dot">.</span>
                          <span className="thinking-dot">.</span>
                          <span className="thinking-dot">.</span>
                        </span>
                      </p>
                      <p className="mt-1 text-[10px] text-[var(--muted)]">
                        This usually takes 1–2 minutes
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--muted)]">
                      {videoStatus.status}
                      {videoStatus.invocationArn ? ` (${videoStatus.invocationArn.slice(-12)})` : ""}
                    </p>
                  )}
                  {videoStatus.status === "Completed" && videoStatus.videoUrl && (
                    <video
                      src={videoStatus.videoUrl}
                      controls
                      playsInline
                      className="w-full max-w-md rounded-lg bg-black aspect-video"
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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

      <div className="pt-4">
        <button onClick={onReset} className="btn-ghost text-xs text-[var(--muted)]">
          Start over with new profile
        </button>
      </div>
    </div>
  );
}
