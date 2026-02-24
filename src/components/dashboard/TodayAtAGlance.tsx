"use client";

import { useState } from "react";
import type { UserProfile, FitnessPlan, MealEntry, Macros, ActivityLogEntry, WorkoutEquipment } from "@/lib/types";

interface ExerciseGif {
  gifUrl: string;
  name: string;
  targetMuscles?: string[];
  instructions?: string[];
}

export function TodayAtAGlance({
  plan,
  meals,
  todaysTotals,
  targets,
  todayAdjustment,
  baseBudget,
  adjustedBudget,
  today,
  workoutProgress,
  exerciseGifs,
  expandedExerciseDemos,
  onToggleDemo,
  fetchExerciseGif,
  matchWorkoutDay,
  matchDietDay,
  activityLog,
  onAddActivity,
  onRemoveActivity,
}: {
  plan: FitnessPlan | null;
  meals: MealEntry[];
  todaysTotals: Macros;
  targets: Macros;
  todayAdjustment: number;
  baseBudget: number;
  adjustedBudget: number;
  today: string;
  workoutProgress: Record<string, string>;
  exerciseGifs: Record<string, ExerciseGif | "loading" | "none">;
  expandedExerciseDemos: Set<string>;
  onToggleDemo: (gifKey: string, expand: boolean) => void;
  fetchExerciseGif: (name: string) => void;
  matchWorkoutDay: (date: string) => number | null;
  matchDietDay: (date: string) => number | null;
  activityLog: ActivityLogEntry[];
  onAddActivity: (entry: ActivityLogEntry) => void;
  onRemoveActivity: (id: string) => void;
}) {
  const pct = (n: number, t: number) => (t > 0 ? Math.min(100, Math.round((n / t) * 100)) : 0);
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [todayWorkoutExpanded, setTodayWorkoutExpanded] = useState(false);
  const [todayDietExpanded, setTodayDietExpanded] = useState(false);

  const todayActivities = activityLog.filter((e) => e.date === today);

  return (
    <div className="card card-accent-border p-6">
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
            <div className={`progress-track !mt-0 ${pct(todaysTotals.calories, adjustedBudget) >= 90 && pct(todaysTotals.calories, adjustedBudget) <= 110 ? "ring-2 ring-[var(--accent)]/30 ring-offset-1 ring-offset-[var(--background)] rounded-full" : ""}`}>
              <div className="progress-fill" style={{ width: `${pct(todaysTotals.calories, adjustedBudget)}%` }} />
            </div>
            <p className="text-caption mt-1 tabular-nums">{Math.max(0, adjustedBudget - todaysTotals.calories)} cal remaining</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(["calories", "protein", "carbs", "fat"] as const).map((key) => {
              const current = todaysTotals[key];
              const target = targets[key];
              const percent = pct(current, target);
              const colorVar = key === "calories" ? "var(--accent)" : key === "protein" ? "var(--accent-sage)" : key === "carbs" ? "var(--accent-warm)" : "var(--accent-terracotta)";
              const radius = 28;
              const circumference = 2 * Math.PI * radius;
              const dashOffset = circumference - (Math.min(percent, 100) / 100) * circumference;
              // Contextual coloring
              const adherenceColor = percent >= 90 && percent <= 110
                ? "text-[var(--accent)]"
                : percent > 110
                  ? "text-[var(--accent-terracotta)]"
                  : "text-[var(--foreground)]";

              return (
                <div key={key} className={`card-flat rounded-lg px-2.5 py-3 macro-${key} transition-all hover:-translate-y-0.5 hover:shadow-[0_1px_3px_rgba(61,55,48,0.06)] flex flex-col items-center`}>
                  <div className="relative h-16 w-16 mb-1.5">
                    <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
                      <circle cx="32" cy="32" r={radius} fill="none" stroke="var(--border-soft)" strokeWidth="4.5" />
                      <circle
                        cx="32" cy="32" r={radius}
                        fill="none"
                        stroke={colorVar}
                        strokeWidth="4.5"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={dashOffset}
                        className="transition-all duration-700"
                        style={{ transitionTimingFunction: "cubic-bezier(0.34, 1.56, 0.64, 1)" }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className={`text-xs font-bold tabular-nums leading-none ${adherenceColor}`}>
                        {percent}%
                      </span>
                    </div>
                  </div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">{key}</p>
                  <p className={`text-sm font-bold tabular-nums leading-tight ${adherenceColor}`}>
                    {key === "calories" ? current : `${current}g`}
                    <span className="stat-value-dim !text-[10px]"> / {key === "calories" ? target : `${target}g`}</span>
                  </p>
                </div>
              );
            })}
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
              <TodayWorkoutCard
                plan={plan}
                today={today}
                expanded={todayWorkoutExpanded}
                onToggle={() => setTodayWorkoutExpanded(!todayWorkoutExpanded)}
                workoutProgress={workoutProgress}
                exerciseGifs={exerciseGifs}
                expandedExerciseDemos={expandedExerciseDemos}
                onToggleDemo={onToggleDemo}
                fetchExerciseGif={fetchExerciseGif}
                matchWorkoutDay={matchWorkoutDay}
              />
              {/* Today's diet */}
              <TodayDietCard
                plan={plan}
                meals={meals}
                today={today}
                expanded={todayDietExpanded}
                onToggle={() => setTodayDietExpanded(!todayDietExpanded)}
                matchDietDay={matchDietDay}
              />
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
                      <button onClick={() => onRemoveActivity(a.id)} className="text-[var(--muted)] hover:text-[var(--accent-terracotta)] text-xs" aria-label={`Remove ${a.label}`}>
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {showActivityForm && (
            <ActivityForm today={today} onAdd={onAddActivity} />
          )}
        </div>
      )}
    </div>
  );
}

/* ── Activity quick-add form ── */
function ActivityForm({ today, onAdd }: { today: string; onAdd: (entry: ActivityLogEntry) => void }) {
  return (
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
              onClick={() => onAdd({ id: `act_${Date.now()}`, date: today, type: "activity", label, category: cat, durationMinutes: mins, calorieAdjustment: cals, loggedAt: new Date().toISOString() })}
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
              onClick={() => onAdd({ id: `sed_${Date.now()}`, date: today, type: "sedentary", label, category: cat, durationMinutes: mins, calorieAdjustment: cals, loggedAt: new Date().toISOString() })}
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
  );
}

/* ── Today's workout mini-card ── */
function TodayWorkoutCard({
  plan,
  today,
  expanded,
  onToggle,
  workoutProgress,
  exerciseGifs,
  expandedExerciseDemos,
  onToggleDemo,
  fetchExerciseGif,
  matchWorkoutDay,
}: {
  plan: FitnessPlan;
  today: string;
  expanded: boolean;
  onToggle: () => void;
  workoutProgress: Record<string, string>;
  exerciseGifs: Record<string, ExerciseGif | "loading" | "none">;
  expandedExerciseDemos: Set<string>;
  onToggleDemo: (gifKey: string, expand: boolean) => void;
  fetchExerciseGif: (name: string) => void;
  matchWorkoutDay: (date: string) => number | null;
}) {
  const idx = matchWorkoutDay(today);
  const w = idx !== null ? plan.workoutPlan.weeklyPlan[idx] : null;
  const done = w ? w.exercises.filter((ex) => Boolean(workoutProgress[`${plan.id}:${w.day}:${ex.name}:${ex.sets}:${ex.reps}:${ex.notes ?? ""}`])).length : 0;
  const total = w?.exercises.length ?? 0;

  return (
    <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-3 py-2.5 text-left flex items-center gap-2 hover:bg-[var(--surface-elevated)] transition-colors"
        aria-expanded={expanded}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent-warm)]/10 text-[var(--accent-warm)]">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
          </svg>
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold">Today&apos;s workout</p>
          {!w ? <p className="text-[10px] text-[var(--muted)]">Rest day</p> : <p className="text-[10px] text-[var(--muted)]">{w.focus} · {done}/{total} done</p>}
        </div>
        <svg className={`h-4 w-4 text-[var(--muted)] flex-shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && w && (
        <div className="border-t border-[var(--border-soft)] px-3 py-2 space-y-1.5">
          <div className="progress-track !mt-0">
            <div className="progress-fill" style={{ width: `${total > 0 ? Math.round((done / total) * 100) : 0}%` }} />
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
                      onToggleDemo(gifKey, !isExpanded);
                      if (!isExpanded) fetchExerciseGif(ex.name);
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
      )}
      {expanded && !w && (
        <div className="px-3 pb-3 text-xs text-[var(--muted)]">No workout today. Use the calendar below to view other days.</div>
      )}
    </div>
  );
}

/* ── Today's diet mini-card ── */
function TodayDietCard({
  plan,
  meals,
  today,
  expanded,
  onToggle,
  matchDietDay,
}: {
  plan: FitnessPlan;
  meals: MealEntry[];
  today: string;
  expanded: boolean;
  onToggle: () => void;
  matchDietDay: (date: string) => number | null;
}) {
  const logged = meals.filter((m) => m.date === today);
  const idx = matchDietDay(today);
  const d = idx !== null ? plan.dietPlan.weeklyPlan[idx] : null;
  const planCal = d?.meals.reduce((s, m) => s + (m.macros?.calories ?? 0), 0) ?? 0;

  return (
    <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-3 py-2.5 text-left flex items-center gap-2 hover:bg-[var(--surface-elevated)] transition-colors"
        aria-expanded={expanded}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)]/10 text-[var(--accent)]">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold">Today&apos;s diet</p>
          <p className="text-[10px] text-[var(--muted)]">
            {logged.length} meal{logged.length !== 1 ? "s" : ""} logged{d ? ` · plan ${planCal} cal` : ""}
          </p>
        </div>
        <svg className={`h-4 w-4 text-[var(--muted)] flex-shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && (
        <div className="border-t border-[var(--border-soft)] px-3 py-2 space-y-2">
          {!d ? (
            <p className="text-xs text-[var(--muted)]">No plan for today. Use the calendar below.</p>
          ) : (
            <>
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
            </>
          )}
        </div>
      )}
    </div>
  );
}
