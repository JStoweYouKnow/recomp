"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { getProfile, getPlan, getMeals, saveProfile, savePlan, saveMeals, getWearableData, saveWearableData, getWearableConnections, saveWearableConnections, getMilestones, saveMilestones, getXP, saveXP, getHasAdjustedPlan, setHasAdjustedPlan, syncToServer, saveWeeklyReview, saveActivityLog, saveWorkoutProgress } from "@/lib/storage";
import type { UserProfile, FitnessPlan, MealEntry, Macros, WearableDaySummary, WeeklyReview, ActivityLogEntry, WorkoutLocation, WorkoutEquipment } from "@/lib/types";
import { getTodayLocal } from "@/lib/date-utils";
import { computeMilestones } from "@/lib/milestones";
import { buildDemoSeed } from "@/lib/demoSeed";
import { MilestonesView } from "@/components/MilestonesView";
import { RicoChat } from "@/components/RicoChat";
import { LandingPage } from "@/components/LandingPage";
import { ProfileView } from "@/components/ProfileView";
import { WearablesView } from "@/components/WearablesView";
import { AdjustView } from "@/components/AdjustView";
import { Dashboard } from "@/components/Dashboard";
import { MealsView } from "@/components/MealsView";
import { WorkoutPlannerView } from "@/components/WorkoutPlannerView";
import { useToast } from "@/components/Toast";
import { v4 as uuidv4 } from "uuid";

export default function Home() {
  const { showToast } = useToast();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [plan, setPlan] = useState<FitnessPlan | null>(null);
  const [meals, setMeals] = useState<MealEntry[]>([]);
  const [view, setView] = useState<"onboard" | "dashboard" | "meals" | "workouts" | "adjust" | "wearables" | "milestones" | "profile">("onboard");
  const prevViewRef = useRef<string>("dashboard");
  const navContainerRef = useRef<HTMLElement>(null);
  const navBtnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [pillStyle, setPillStyle] = useState<{ transform: string; width: string } | null>(null);

  const updatePill = useCallback(() => {
    const container = navContainerRef.current;
    const btn = navBtnRefs.current[view];
    if (!container || !btn) return;
    const cRect = container.getBoundingClientRect();
    const bRect = btn.getBoundingClientRect();
    setPillStyle({
      transform: `translateX(${bRect.left - cRect.left}px)`,
      width: `${bRect.width}px`,
    });
  }, [view]);

  useEffect(() => {
    updatePill();
    window.addEventListener("resize", updatePill);
    return () => window.removeEventListener("resize", updatePill);
  }, [updatePill]);
  const VIEW_ORDER = ["dashboard", "meals", "workouts", "adjust", "wearables", "milestones", "profile"] as const;
  const getSlideClass = (v: string) => {
    const curr = VIEW_ORDER.indexOf(v as typeof VIEW_ORDER[number]);
    const prev = VIEW_ORDER.indexOf(prevViewRef.current as typeof VIEW_ORDER[number]);
    if (curr < 0 || prev < 0) return "animate-fade-in";
    if (curr > prev) return "animate-slide-in-left";
    if (curr < prev) return "animate-slide-in-right";
    return "animate-fade-in";
  };
  const navigateTo = (key: typeof view) => {
    prevViewRef.current = view;
    setView(key);
  };
  const [loading, setLoading] = useState(false);
  const [planRegenerating, setPlanRegenerating] = useState(false);
  const [adjustFeedback, setAdjustFeedback] = useState("");
  const [adjustResult, setAdjustResult] = useState<Record<string, unknown> | null>(null);
  const [ricoOpen, setRicoOpen] = useState(false);
  const [milestones, setMilestonesState] = useState(getMilestones());
  const [xp, setXp] = useState(getXP());
  const [milestoneProgress, setMilestoneProgress] = useState<Record<string, number>>({});
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [planLoadingMessage, setPlanLoadingMessage] = useState("Amazon Nova is generating your personalized diet and workout plan…");

  useEffect(() => {
    const p = getProfile();
    setProfile(p);
    if (p) {
      setPlan(getPlan());
      setMeals(getMeals());
      setMilestonesState(getMilestones());
      setXp(getXP());
      setView(p ? "dashboard" : "onboard");
    }
  }, []);

  useEffect(() => {
    if (!plan || meals.length === 0) return;
    const targets = plan.dietPlan?.dailyTargets ?? { calories: 2000, protein: 150, carbs: 200, fat: 65 };
    const conns = getWearableConnections();
    const wData = getWearableData();
    const wearableCount = conns.length + (wData.length > 0 ? 1 : 0);
    const stored = getMilestones();
    const earned = new Set(stored.map((m) => m.id));
    const { newMilestones, xpGained, progress } = computeMilestones(
      meals,
      plan,
      targets,
      wearableCount,
      getHasAdjustedPlan(),
      earned
    );
    if (newMilestones.length > 0) {
      const next = [...stored, ...newMilestones];
      setMilestonesState(next);
      saveMilestones(next);
    }
    if (xpGained > 0) {
      const currentXp = getXP();
      const nextXp = currentXp + xpGained;
      setXp(nextXp);
      saveXP(nextXp);
    }
    setMilestoneProgress(progress);
  }, [meals, plan]);

  useEffect(() => {
    if (!profile) return;
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => setIsDemoMode(data.authenticated === false))
      .catch(() => setIsDemoMode(false));
  }, [profile]);

  const today = getTodayLocal();
  const todaysMeals = meals.filter((m) => m.date === today);
  const todaysTotals = todaysMeals.reduce(
    (acc, m) => ({
      calories: acc.calories + m.macros.calories,
      protein: acc.protein + m.macros.protein,
      carbs: acc.carbs + m.macros.carbs,
      fat: acc.fat + m.macros.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
  const targets = plan?.dietPlan?.dailyTargets ?? { calories: 2000, protein: 150, carbs: 200, fat: 65 };

  const handleOnboard = async (data: Partial<UserProfile>) => {
    const newProfile: UserProfile = {
      id: uuidv4(),
      name: data.name || "User",
      age: data.age || 30,
      weight: data.weight || 70,
      height: data.height || 170,
      gender: data.gender || "other",
      fitnessLevel: data.fitnessLevel || "intermediate",
      goal: data.goal || "maintain",
      dietaryRestrictions: data.dietaryRestrictions || [],
      injuriesOrLimitations: data.injuriesOrLimitations || [],
      dailyActivityLevel: data.dailyActivityLevel || "moderate",
      workoutLocation: data.workoutLocation ?? "gym",
      workoutEquipment: data.workoutEquipment ?? ["free_weights", "machines"],
      workoutDaysPerWeek: data.workoutDaysPerWeek ?? 4,
      workoutTimeframe: data.workoutTimeframe ?? "flexible",
      createdAt: new Date().toISOString(),
    };
    saveProfile(newProfile);
    setProfile(newProfile);
    setView("dashboard");
    setPlanRegenerating(true);
    setLoading(true);
    const progressMessages = [
      "Analyzing your profile and goal…",
      "Calibrating calorie and macro targets…",
      "Drafting your weekly workout split…",
      "Finalizing your personalized plan…",
    ];
    let progressIndex = 0;
    setPlanLoadingMessage(progressMessages[progressIndex]);
    const progressTimer = setInterval(() => {
      progressIndex = (progressIndex + 1) % progressMessages.length;
      setPlanLoadingMessage(progressMessages[progressIndex]);
    }, 3200);

    try {
      // Register user in DynamoDB and set auth cookie
      const regRes = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newProfile),
      }).catch(() => null);
      if (regRes?.ok) setIsDemoMode(false);

      const res = await fetch("/api/plans/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newProfile),
      });
      const p = await res.json();
      if (p.error) throw new Error(p.error);
      savePlan(p);
      setPlan(p);
      syncToServer(); // persist to DynamoDB
    } catch (e) {
      console.error(e);
      showToast("Plan generation took longer than expected. You can continue in the dashboard and regenerate when ready.", "info");
    } finally {
      clearInterval(progressTimer);
      setLoading(false);
      setPlanRegenerating(false);
      setPlanLoadingMessage("Amazon Nova is generating your personalized diet and workout plan…");
    }
  };

  const handleRegeneratePlan = async () => {
    if (!profile) return;
    setPlanRegenerating(true);
    try {
      const res = await fetch("/api/plans/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      const p = await res.json();
      if (p.error) throw new Error(p.error);
      savePlan(p);
      setPlan(p);
      syncToServer();
    } catch (e) {
      console.error(e);
      showToast("Plan generation failed. Try again.", "error");
    } finally {
      setPlanRegenerating(false);
    }
  };

  const handleAdjust = async () => {
    if (!plan) return;
    setLoading(true);
    setAdjustResult(null);
    try {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const recentMeals = meals.filter((m) => new Date(m.date) >= weekAgo);
      const avgCal = recentMeals.length
        ? recentMeals.reduce((s, m) => s + m.macros.calories, 0) / 7
        : null;
      const avgProt = recentMeals.length
        ? recentMeals.reduce((s, m) => s + m.macros.protein, 0) / 7
        : null;

      const res = await fetch("/api/plans/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          mealsThisWeek: recentMeals,
          feedback: adjustFeedback,
          avgDailyCalories: avgCal,
          avgDailyProtein: avgProt,
        }),
      });
      const r = await res.json();
      if (r.error) throw new Error(r.error);
      setAdjustResult(r);
    } catch (e) {
      console.error(e);
      showToast("Adjustment failed.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleUsePreseededDemo = () => {
    const seed = buildDemoSeed();

    saveProfile(seed.profile);
    savePlan(seed.plan);
    saveMeals(seed.meals);
    saveWearableConnections(seed.wearableConnections);
    saveWearableData(seed.wearableData);
    saveMilestones(seed.milestones);
    saveXP(seed.xp);
    saveWeeklyReview(seed.weeklyReview);
    saveActivityLog(seed.activityLog);
    saveWorkoutProgress(seed.workoutProgress);

    setProfile(seed.profile);
    setPlan(seed.plan);
    setMeals(seed.meals);
    setMilestonesState(seed.milestones);
    setXp(seed.xp);
    setMilestoneProgress({});
    setView("dashboard");
    setIsDemoMode(true);
  };

  const handleResetDemoData = () => {
    if (typeof window !== "undefined") {
      localStorage.clear();
    }
    setProfile(null);
    setPlan(null);
    setMeals([]);
    setMilestonesState([]);
    setXp(0);
    setMilestoneProgress({});
    setAdjustFeedback("");
    setAdjustResult(null);
    setRicoOpen(false);
    setView("onboard");
    setIsDemoMode(false);
  };

  if (profile === null && view === "onboard") {
    return (
      <LandingPage
        onSubmit={handleOnboard}
        loading={loading}
        onUsePreseededDemo={handleUsePreseededDemo}
        onResetDemoData={handleResetDemoData}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      {/* ── Sticky header ── */}
      <header className="sticky top-0 z-30 border-b border-[var(--border-soft)] bg-[var(--background)]/95 backdrop-blur-sm" role="banner">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
          <button onClick={() => navigateTo("dashboard")} className="flex items-baseline gap-2 group" aria-label="Go to dashboard">
            <span className="flex items-center gap-1" aria-hidden="true">
              <svg className="h-5 w-5 text-[var(--accent)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
            </span>
            <span className="brand-title !text-lg text-[var(--accent)] leading-none group-hover:opacity-80 transition-opacity">Recomp</span>
            <span className="brand-definition text-[var(--muted)] hidden sm:inline">body recomposition</span>
          </button>
          <span className="hidden md:inline-flex items-center rounded-full border border-[var(--border-soft)] bg-[var(--surface-elevated)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--muted)]">Amazon Nova AI</span>

          <nav ref={navContainerRef} className="nav-morphing flex items-center gap-1 overflow-x-auto" aria-label="Main navigation">
            {pillStyle && (
              <span
                className="nav-morph-pill"
                style={pillStyle}
                aria-hidden="true"
              />
            )}
            {([
              ["dashboard", "Dashboard", "Go to dashboard"],
              ["meals", "Meals", "Log meals and track macros"],
              ["workouts", "Workouts", "View and edit workout plan"],
              ["adjust", "Adjust", "Get AI plan adjustments"],
              ["wearables", "Wearables", "Connect devices"],
              ["milestones", "Progress", "View progress and milestones"],
              ["profile", "Profile", "Edit your profile"],
            ] as const).map(([key, label, title]) => (
              <button
                key={key}
                ref={(el) => { navBtnRefs.current[key] = el; }}
                onClick={() => navigateTo(key)}
                className={`nav-item relative z-[1] ${view === key ? "nav-item-active !bg-transparent !shadow-none" : ""}`}
                aria-current={view === key ? "page" : undefined}
                title={title}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {isDemoMode && (
        <div
          className="mx-auto max-w-5xl px-5 py-2.5 flex items-center justify-center gap-2"
          role="status"
          aria-live="polite"
        >
          <span className="inline-flex items-center gap-2 rounded-full bg-[var(--surface-elevated)] border border-[var(--border-soft)] px-3 py-1.5 text-sm text-[var(--muted-foreground)]">
            <span className="h-2 w-2 rounded-full bg-[var(--accent-warm)] animate-pulse" aria-hidden />
            <span><strong className="text-[var(--foreground)] font-medium">Demo mode</strong> — Data stored locally. Complete onboarding to sync.</span>
          </span>
        </div>
      )}

      {/* Bottom nav (mobile) */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-20 border-t border-[var(--border-soft)] bg-[var(--background)]/95 backdrop-blur-sm safe-area-pb"
        aria-label="Mobile navigation"
      >
        <div className="flex items-center justify-around py-2">
          {(["dashboard", "meals", "workouts", "adjust"] as const).map((key) => (
            <button
              key={key}
              onClick={() => navigateTo(key)}
              className={`flex flex-col items-center gap-0.5 min-h-[44px] min-w-[44px] justify-center px-4 rounded-lg transition-colors ${
                view === key ? "text-[var(--accent)]" : "text-[var(--muted)]"
              }`}
              aria-current={view === key ? "page" : undefined}
            >
              <span className="flex items-center justify-center h-5 w-5">
                {key === "dashboard" && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                    <rect x="3" y="3" width="7" height="7" rx="1.5" />
                    <rect x="14" y="3" width="7" height="4" rx="1.5" />
                    <rect x="14" y="11" width="7" height="10" rx="1.5" />
                    <rect x="3" y="14" width="7" height="7" rx="1.5" />
                  </svg>
                )}
                {key === "meals" && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                    <path d="M18 8h1a4 4 0 010 8h-1" />
                    <path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z" />
                    <line x1="6" y1="1" x2="6" y2="4" />
                    <line x1="10" y1="1" x2="10" y2="4" />
                    <line x1="14" y1="1" x2="14" y2="4" />
                  </svg>
                )}
                {key === "workouts" && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                    <path d="M6.5 6.5a2.5 2.5 0 015 0v11a2.5 2.5 0 01-5 0v-11z" />
                    <path d="M17.5 6.5a2.5 2.5 0 00-5 0v11a2.5 2.5 0 005 0v-11z" />
                    <path d="M4 12h16" />
                    <path d="M2 12h2" />
                    <path d="M20 12h2" />
                  </svg>
                )}
                {key === "adjust" && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 2v4m0 12v4m-7.07-3.93l2.83-2.83m8.48-8.48l2.83-2.83M2 12h4m12 0h4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83" />
                  </svg>
                )}
              </span>
              <span className="text-[10px] font-medium capitalize">{key}</span>
            </button>
          ))}
        </div>
      </nav>

      <main id="main-content" className="relative z-10 mx-auto max-w-5xl px-5 py-8 pb-24 md:pb-8" role="main">
        {view === "dashboard" && (
          <div key="dashboard" className={getSlideClass("dashboard")}>
          <Dashboard
            profile={profile!}
            plan={plan}
            meals={meals}
            todaysTotals={todaysTotals}
            targets={targets}
            wearableData={getWearableData()}
            onProfileUpdate={(updated) => {
              saveProfile(updated);
              setProfile(updated);
              syncToServer();
            }}
            onPlanUpdate={(updated) => {
              savePlan(updated);
              setPlan(updated);
              syncToServer();
            }}
            onRegeneratePlan={handleRegeneratePlan}
            planRegenerating={planRegenerating}
            planLoadingMessage={planLoadingMessage}
            onNavigateToMeals={() => navigateTo("meals")}
            onNavigateToWorkouts={() => navigateTo("workouts")}
            onReset={() => {
              localStorage.clear();
              setProfile(null);
              setPlan(null);
              setMeals([]);
              setMilestonesState([]);
              setXp(0);
              setMilestoneProgress({});
              saveWearableData([]);
              saveWearableConnections([]);
              navigateTo("onboard");
            }}
          />
          </div>
        )}
        {view === "meals" && (
          <div key="meals" className={getSlideClass("meals")}>
          <MealsView
            meals={meals}
            todaysMeals={todaysMeals}
            todaysTotals={todaysTotals}
            targets={targets}
            onAddMeal={(m) => {
              const next = [...meals, m];
              setMeals(next);
              saveMeals(next);
              syncToServer();
            }}
            onEditMeal={(m) => {
              const next = meals.map((x) => (x.id === m.id ? m : x));
              setMeals(next);
              saveMeals(next);
              syncToServer();
            }}
            onDeleteMeal={(id) => {
              const next = meals.filter((x) => x.id !== id);
              setMeals(next);
              saveMeals(next);
              syncToServer();
            }}
          />
          </div>
        )}
        {view === "workouts" && (
          <div key="workouts" className={getSlideClass("workouts")}>
          <WorkoutPlannerView
            plan={plan}
            onUpdatePlan={(updated) => {
              savePlan(updated);
              setPlan(updated);
            }}
            onPlanSaved={syncToServer}
          />
          </div>
        )}
        {view === "wearables" && (
          <div key="wearables" className={getSlideClass("wearables")}>
          <WearablesView
            onDataFetched={(data) => {
              const existing = getWearableData();
              const merged = [...existing];
              data.forEach((d: WearableDaySummary) => {
                const i = merged.findIndex((x) => x.date === d.date && x.provider === d.provider);
                if (i >= 0) merged[i] = { ...merged[i], ...d };
                else merged.push(d);
              });
              saveWearableData(merged);
            }}
          />
          </div>
        )}
        {view === "milestones" && (
          <div key="milestones" className={getSlideClass("milestones")}>
          <MilestonesView
            milestones={milestones}
            xp={xp}
            progress={milestoneProgress}
          />
          </div>
        )}
        {view === "adjust" && (
          <div key="adjust" className={getSlideClass("adjust")}>
          <AdjustView
            plan={plan}
            goal={profile?.goal ?? "maintain"}
            feedback={adjustFeedback}
            setFeedback={setAdjustFeedback}
            result={adjustResult}
            loading={loading}
            onAdjust={handleAdjust}
            onApplyAdjustments={(newTargets) => {
              if (plan && newTargets) {
                setHasAdjustedPlan();
                const updated = {
                  ...plan,
                  dietPlan: { ...plan.dietPlan, dailyTargets: newTargets as Macros },
                };
                savePlan(updated);
                setPlan(updated);
                setAdjustResult(null);
                setAdjustFeedback("");
                syncToServer();
              }
            }}
          />
          </div>
        )}
        {view === "profile" && profile && (
          <div key="profile" className={getSlideClass("profile")}>
          <ProfileView
            profile={profile}
            onProfileUpdate={(updated) => {
              saveProfile(updated);
              setProfile(updated);
              syncToServer();
            }}
          />
          </div>
        )}
      </main>

      {profile && view !== "onboard" && (
        <>
          <button
            onClick={() => setRicoOpen(true)}
            className="fixed bottom-20 md:bottom-6 right-6 z-20 flex h-14 w-14 min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-[var(--accent)] text-2xl shadow-[var(--shadow-strong)] transition-all hover:bg-[var(--accent-hover)] hover:scale-105 active:scale-95 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] animate-fab-breathe"
            aria-label="Chat with Reco"
            title="Chat with Reco"
          >
            <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          </button>
          <RicoChat
            userName={profile.name}
            context={{
              streak: getCurrentStreakFromMeals(meals),
              mealsLogged: meals.length,
              xp,
              goal: profile.goal,
              recentMilestones: milestones.slice(-5).map((m) => m.id),
            }}
            isOpen={ricoOpen}
            onClose={() => setRicoOpen(false)}
          />
        </>
      )}
    </div>
  );
}

function getCurrentStreakFromMeals(meals: MealEntry[]): number {
  const dates = new Set(meals.map((m) => m.date));
  const today = getTodayLocal();
  if (!dates.has(today)) return 0;
  const sorted = Array.from(dates).sort().reverse();
  let streak = 0;
  let prev: number | null = null;
  for (const d of sorted) {
    const t = new Date(d).getTime();
    if (prev === null || prev - t === 86400000) streak++;
    else break;
    prev = t;
  }
  return streak;
}

