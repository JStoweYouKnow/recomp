"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { getWorkoutProgress, saveWorkoutProgress } from "@/lib/storage";
import type { FitnessPlan } from "@/lib/types";
import { CalendarView } from "./CalendarView";

/* ── Exercise GIF cache (shared key with Dashboard) ── */
const EX_CACHE_KEY = "recomp_exercise_gifs_v2";
interface ExerciseGif {
  gifUrl: string;
  name: string;
  targetMuscles?: string[];
  instructions?: string[];
}
function getGifCache(): Record<string, ExerciseGif> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(EX_CACHE_KEY) ?? "{}"); } catch { return {}; }
}
function setGifCache(cache: Record<string, ExerciseGif>) {
  try { localStorage.setItem(EX_CACHE_KEY, JSON.stringify(cache)); } catch { /* quota */ }
}

/** Map a calendar day-of-week (0=Sun..6=Sat) to common day name prefixes */
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SHORT_WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function WorkoutPlannerView({
  plan,
  onUpdatePlan,
}: {
  plan: FitnessPlan | null;
  onUpdatePlan: (plan: FitnessPlan) => void;
}) {
  const [progress, setProgress] = useState<Record<string, string>>(getWorkoutProgress());
  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  const [editingDay, setEditingDay] = useState<number | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(today);

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
      if (!res.ok) {
        setExerciseGifs((prev) => ({ ...prev, [key]: "none" }));
        return;
      }
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

  /**
   * Try to match a calendar date to a workout day index.
   * Strategy: match day name ("Monday" → "Monday" / "Mon"), or "Day N" → Nth weekday from Monday.
   */
  const matchDayToDate = useCallback(
    (date: string): number | null => {
      if (!plan) return null;
      const d = new Date(date + "T12:00:00");
      const dow = d.getDay(); // 0=Sun
      const dayName = WEEKDAY_NAMES[dow].toLowerCase();
      const shortName = SHORT_WEEKDAY[dow].toLowerCase();

      for (let i = 0; i < plan.workoutPlan.weeklyPlan.length; i++) {
        const planDay = plan.workoutPlan.weeklyPlan[i].day.toLowerCase().trim();
        if (
          planDay === dayName ||
          planDay === shortName ||
          planDay.startsWith(dayName) ||
          planDay.startsWith(shortName)
        ) {
          return i;
        }
      }

      // Fallback: "Day 1" → Monday=0, "Day 2" → Tuesday=1, etc.
      const mondayBased = dow === 0 ? 6 : dow - 1; // 0=Mon..6=Sun
      if (mondayBased < plan.workoutPlan.weeklyPlan.length) {
        return mondayBased;
      }
      return null;
    },
    [plan]
  );

  // Dates that have completed exercises (for dot indicators)
  const completedDates = useMemo(() => {
    const dates = new Set<string>();
    for (const ts of Object.values(progress)) {
      if (ts) dates.add(ts.slice(0, 10));
    }
    return dates;
  }, [progress]);

  // Auto-expand the matched day when a calendar date is selected
  useEffect(() => {
    if (!calendarOpen) return;
    const match = matchDayToDate(selectedDate);
    if (match !== null) {
      setExpandedDay(match);
    }
  }, [calendarOpen, selectedDate, matchDayToDate]);

  const exerciseKey = (
    day: FitnessPlan["workoutPlan"]["weeklyPlan"][number],
    exercise: FitnessPlan["workoutPlan"]["weeklyPlan"][number]["exercises"][number]
  ) => {
    if (!plan) return "";
    return `${plan.id}:${day.day}:${exercise.name}:${exercise.sets}:${exercise.reps}:${exercise.notes ?? ""}`;
  };

  useEffect(() => {
    if (!plan) return;
    const validKeys = new Set(
      plan.workoutPlan.weeklyPlan.flatMap((day) =>
        day.exercises.map((exercise) => exerciseKey(day, exercise))
      )
    );
    const cleaned = Object.fromEntries(Object.entries(progress).filter(([k]) => validKeys.has(k)));
    if (Object.keys(cleaned).length !== Object.keys(progress).length) {
      setProgress(cleaned);
      saveWorkoutProgress(cleaned);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);

  if (!plan) {
    return (
      <div className="space-y-4 animate-fade-in">
        <h2 className="section-title !text-xl">Workout planner</h2>
        <p className="section-subtitle">Generate a plan first to manage workouts.</p>
      </div>
    );
  }

  const totalExercises = plan.workoutPlan.weeklyPlan.reduce((sum, day) => sum + day.exercises.length, 0);
  const completedExercises = plan.workoutPlan.weeklyPlan.reduce(
    (sum, day) => sum + day.exercises.filter((exercise) => Boolean(progress[exerciseKey(day, exercise)])).length,
    0
  );
  const completionPct = totalExercises > 0 ? Math.round((completedExercises / totalExercises) * 100) : 0;

  const updateWeeklyPlan = (nextWeeklyPlan: FitnessPlan["workoutPlan"]["weeklyPlan"]) => {
    onUpdatePlan({
      ...plan,
      workoutPlan: {
        ...plan.workoutPlan,
        weeklyPlan: nextWeeklyPlan,
      },
    });
  };

  const updateDay = (
    dayIndex: number,
    updater: (day: FitnessPlan["workoutPlan"]["weeklyPlan"][number]) => FitnessPlan["workoutPlan"]["weeklyPlan"][number]
  ) => {
    const next = plan.workoutPlan.weeklyPlan.map((day, idx) => (idx === dayIndex ? updater(day) : day));
    updateWeeklyPlan(next);
  };

  const moveDay = (dayIndex: number, direction: -1 | 1) => {
    const target = dayIndex + direction;
    if (target < 0 || target >= plan.workoutPlan.weeklyPlan.length) return;
    const next = [...plan.workoutPlan.weeklyPlan];
    const [moved] = next.splice(dayIndex, 1);
    next.splice(target, 0, moved);
    updateWeeklyPlan(next);
  };

  const toggleComplete = (
    day: FitnessPlan["workoutPlan"]["weeklyPlan"][number],
    exercise: FitnessPlan["workoutPlan"]["weeklyPlan"][number]["exercises"][number]
  ) => {
    const key = exerciseKey(day, exercise);
    const next = { ...progress };
    if (next[key]) delete next[key];
    else next[key] = new Date().toISOString();
    setProgress(next);
    saveWorkoutProgress(next);
  };

  const setDayCompletion = (
    day: FitnessPlan["workoutPlan"]["weeklyPlan"][number],
    complete: boolean
  ) => {
    const next = { ...progress };
    for (const exercise of day.exercises) {
      const key = exerciseKey(day, exercise);
      if (complete) next[key] = new Date().toISOString();
      else delete next[key];
    }
    setProgress(next);
    saveWorkoutProgress(next);
  };

  const parseRest = (notes?: string): string | null => {
    if (!notes) return null;
    const m = notes.match(/rest[:\s]*(\d+[\s-]*\d*\s*(?:sec|s|min|m|seconds|minutes)?)/i);
    return m ? m[1].trim() : null;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="section-title !text-xl">Workout planner</h2>
          <p className="section-subtitle">Tap a day to expand. Mark exercises done as you go; use Show demo for form cues.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCalendarOpen((v) => !v)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              calendarOpen
                ? "bg-[var(--accent)] text-white"
                : "bg-[var(--surface-elevated)] text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
            aria-pressed={calendarOpen}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Calendar
          </button>
          <button
            onClick={() => {
              updateWeeklyPlan([
                ...plan.workoutPlan.weeklyPlan,
                { day: `Day ${plan.workoutPlan.weeklyPlan.length + 1}`, focus: "General fitness", exercises: [] },
              ]);
              setExpandedDay(plan.workoutPlan.weeklyPlan.length);
              setEditingDay(plan.workoutPlan.weeklyPlan.length);
            }}
            className="btn-primary px-4 py-2 text-sm"
          >
            + Add day
          </button>
        </div>
      </div>

      {/* Calendar */}
      {calendarOpen && (
        <div className="card p-4 animate-slide-up">
          <CalendarView
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            dotDates={completedDates}
            daySummary={
              matchDayToDate(selectedDate) !== null ? (
                <div className="text-xs text-[var(--muted)] space-y-0.5">
                  <p className="font-medium text-[var(--foreground)]">
                    {plan.workoutPlan.weeklyPlan[matchDayToDate(selectedDate)!]?.day}
                  </p>
                  <p>{plan.workoutPlan.weeklyPlan[matchDayToDate(selectedDate)!]?.focus}</p>
                  <p>
                    {plan.workoutPlan.weeklyPlan[matchDayToDate(selectedDate)!]?.exercises.length} exercise{plan.workoutPlan.weeklyPlan[matchDayToDate(selectedDate)!]?.exercises.length !== 1 ? "s" : ""}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-[var(--muted)]">No workout scheduled</p>
              )
            }
          />
        </div>
      )}

      <div className="card p-5">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-[var(--muted)]">Weekly completion</span>
          <span className="font-semibold">{completedExercises} / {totalExercises} exercises</span>
        </div>
        <div className="progress-track !mt-0">
          <div className="progress-fill" style={{ width: `${completionPct}%` }} />
        </div>
      </div>

      <div className="space-y-3">
        {plan.workoutPlan.weeklyPlan.map((day, dayIndex) => {
          // When calendar is open, only show the matched day
          const matchedIdx = calendarOpen ? matchDayToDate(selectedDate) : null;
          if (calendarOpen && matchedIdx !== null && dayIndex !== matchedIdx) return null;
          if (calendarOpen && matchedIdx === null) return null;

          const total = day.exercises.length;
          const completed = day.exercises.filter((exercise) => Boolean(progress[exerciseKey(day, exercise)])).length;
          const allDone = total > 0 && completed === total;
          const isExpanded = calendarOpen ? true : expandedDay === dayIndex;
          const isEditing = editingDay === dayIndex;

          return (
            <div key={`${day.day}-${dayIndex}`} className="rounded-xl card overflow-hidden transition-all">
              {/* ── Collapsed card header (always visible, clickable) ── */}
              <button
                type="button"
                onClick={() => {
                  setExpandedDay(isExpanded ? null : dayIndex);
                  if (isExpanded) setEditingDay(null);
                }}
                className="w-full px-5 py-4 text-left flex items-center gap-4 hover:bg-[var(--surface-elevated)] transition-colors"
                aria-expanded={isExpanded}
              >
                {/* Day number / completion ring */}
                <div className={`relative flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors ${allDone ? "border-[var(--accent)] bg-[var(--accent)]/10" : "border-[var(--border)] bg-[var(--surface-elevated)]"}`}>
                  <span className={`text-sm font-bold ${allDone ? "text-[var(--accent)]" : "text-[var(--foreground)]"}`}>
                    {day.day.replace(/^Day\s*/i, "").slice(0, 3)}
                  </span>
                  {allDone && (
                    <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] text-[10px] text-white">
                      ✓
                    </span>
                  )}
                </div>

                {/* Title + summary */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold truncate">{day.day}</p>
                    <span className="rounded-full bg-[var(--accent)]/10 px-2 py-0.5 text-xs font-medium text-[var(--accent)] whitespace-nowrap">
                      {day.focus}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--muted)] truncate">
                    {total === 0
                      ? "No exercises yet"
                      : day.exercises.slice(0, 4).map((e) => e.name).join(", ") + (total > 4 ? ` +${total - 4} more` : "")}
                  </p>
                </div>

                {/* Progress badge */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right">
                    <p className={`text-sm font-medium ${allDone ? "text-[var(--accent)]" : "text-[var(--foreground)]"}`}>
                      {completed}/{total}
                    </p>
                    <p className="text-[10px] text-[var(--muted)]">done</p>
                  </div>
                  <svg
                    className={`h-4 w-4 text-[var(--muted)] transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* ── Expanded detail panel ── */}
              {isExpanded && (
                <div className="border-t border-[var(--border-soft)] px-5 py-4 space-y-4">
                  {/* Action bar */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); setDayCompletion(day, !allDone); }}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${allDone ? "bg-[var(--accent)]/10 text-[var(--accent)]" : "bg-[var(--surface-elevated)] text-[var(--muted)] hover:text-[var(--foreground)]"}`}
                      disabled={total === 0}
                    >
                      {allDone ? "Clear completion" : "Mark all complete"}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingDay(isEditing ? null : dayIndex); }}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${isEditing ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-elevated)] text-[var(--muted)] hover:text-[var(--foreground)]"}`}
                    >
                      {isEditing ? "Done editing" : "Edit"}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); moveDay(dayIndex, -1); }} className="btn-secondary px-2 py-1 text-xs" disabled={dayIndex === 0}>Move up</button>
                    <button onClick={(e) => { e.stopPropagation(); moveDay(dayIndex, 1); }} className="btn-secondary px-2 py-1 text-xs" disabled={dayIndex === plan.workoutPlan.weeklyPlan.length - 1}>Move down</button>
                    {isEditing && (
                      <button
                        onClick={(e) => { e.stopPropagation(); updateWeeklyPlan(plan.workoutPlan.weeklyPlan.filter((_, idx) => idx !== dayIndex)); setExpandedDay(null); setEditingDay(null); }}
                        className="px-2 py-1 text-xs text-[var(--accent-terracotta)] hover:underline"
                      >
                        Delete day
                      </button>
                    )}
                  </div>

                  {/* Editable day name + focus (only in edit mode) */}
                  {isEditing && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input
                        value={day.day}
                        onChange={(e) => updateDay(dayIndex, (d) => ({ ...d, day: e.target.value }))}
                        className="input-base rounded-lg px-3 py-2 text-sm"
                        placeholder="Day name"
                      />
                      <input
                        value={day.focus}
                        onChange={(e) => updateDay(dayIndex, (d) => ({ ...d, focus: e.target.value }))}
                        className="input-base rounded-lg px-3 py-2 text-sm"
                        placeholder="Focus area"
                      />
                    </div>
                  )}

                  {/* ── Exercise list ── */}
                  {total === 0 ? (
                    <p className="py-4 text-center text-sm text-[var(--muted)]">No exercises yet. Tap &quot;Edit&quot; to add some.</p>
                  ) : (
                    <div className="space-y-2">
                      {/* Table header */}
                      <div className="hidden sm:grid sm:grid-cols-[auto_2fr_1fr_1fr_1fr] gap-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                        <span />
                        <span>Exercise</span>
                        <span>Sets</span>
                        <span>Reps</span>
                        <span>Rest</span>
                      </div>

                      {day.exercises.map((exercise, exIndex) => {
                        const isDone = Boolean(progress[exerciseKey(day, exercise)]);
                        const completedAt = progress[exerciseKey(day, exercise)];
                        const restTime = parseRest(exercise.notes);

                        return (
                          <div
                            key={`${exercise.name}-${exIndex}`}
                            className={`rounded-lg border p-3 transition-colors ${
                              isDone
                                ? "border-[var(--accent)]/30 bg-[var(--accent)]/5"
                                : "border-[var(--border-soft)] hover:bg-[var(--surface-elevated)]"
                            }`}
                          >
                            {isEditing ? (
                              /* ── Edit mode: inline inputs ── */
                              <>
                                <div className="grid gap-2 sm:grid-cols-[auto_2fr_1fr_1fr_auto] sm:items-center">
                                  <input
                                    type="checkbox"
                                    checked={isDone}
                                    onChange={() => toggleComplete(day, exercise)}
                                    aria-label={`Mark ${exercise.name || "exercise"} complete`}
                                    className="h-4 w-4 accent-[var(--accent)]"
                                  />
                                  <input
                                    value={exercise.name}
                                    onChange={(e) =>
                                      updateDay(dayIndex, (d) => ({
                                        ...d,
                                        exercises: d.exercises.map((x, i) => (i === exIndex ? { ...x, name: e.target.value } : x)),
                                      }))
                                    }
                                    placeholder="Exercise"
                                    className="input-base rounded px-2 py-1 text-sm"
                                  />
                                  <input
                                    value={exercise.sets}
                                    onChange={(e) =>
                                      updateDay(dayIndex, (d) => ({
                                        ...d,
                                        exercises: d.exercises.map((x, i) => (i === exIndex ? { ...x, sets: e.target.value } : x)),
                                      }))
                                    }
                                    placeholder="Sets"
                                    className="input-base rounded px-2 py-1 text-sm"
                                  />
                                  <input
                                    value={exercise.reps}
                                    onChange={(e) =>
                                      updateDay(dayIndex, (d) => ({
                                        ...d,
                                        exercises: d.exercises.map((x, i) => (i === exIndex ? { ...x, reps: e.target.value } : x)),
                                      }))
                                    }
                                    placeholder="Reps"
                                    className="input-base rounded px-2 py-1 text-sm"
                                  />
                                  <div className="flex items-center gap-2 justify-end">
                                    <button onClick={() => updateDay(dayIndex, (d) => { if (exIndex === 0) return d; const exercises = [...d.exercises]; const [moved] = exercises.splice(exIndex, 1); exercises.splice(exIndex - 1, 0, moved); return { ...d, exercises }; })} className="btn-secondary px-2 py-1 text-xs" disabled={exIndex === 0}>↑</button>
                                    <button onClick={() => updateDay(dayIndex, (d) => { if (exIndex === d.exercises.length - 1) return d; const exercises = [...d.exercises]; const [moved] = exercises.splice(exIndex, 1); exercises.splice(exIndex + 1, 0, moved); return { ...d, exercises }; })} className="btn-secondary px-2 py-1 text-xs" disabled={exIndex === day.exercises.length - 1}>↓</button>
                                    <button onClick={() => updateDay(dayIndex, (d) => ({ ...d, exercises: d.exercises.filter((_, i) => i !== exIndex) }))} className="text-xs text-[var(--accent-terracotta)] hover:underline">Delete</button>
                                  </div>
                                </div>
                                <input
                                  value={exercise.notes ?? ""}
                                  onChange={(e) =>
                                    updateDay(dayIndex, (d) => ({
                                      ...d,
                                      exercises: d.exercises.map((x, i) => (i === exIndex ? { ...x, notes: e.target.value } : x)),
                                    }))
                                  }
                                  placeholder="Notes (e.g. rest: 60s, tempo: 3-1-1)"
                                  className="mt-2 input-base rounded px-2 py-1 text-xs w-full"
                                />
                                {(() => {
                                  const gifKey = exercise.name.toLowerCase().trim();
                                  const gif = exerciseGifs[gifKey];
                                  const isExpanded = expandedExerciseDemos.has(gifKey);
                                  const showGif = typeof gif === "object" && gif.gifUrl && isExpanded;
                                  return (
                                    <div className="mt-2">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (isExpanded) setExpandedExerciseDemos((prev) => { const n = new Set(prev); n.delete(gifKey); return n; });
                                          else { setExpandedExerciseDemos((prev) => new Set(prev).add(gifKey)); fetchExerciseGif(exercise.name); }
                                        }}
                                        className="text-xs font-medium text-[var(--accent)] hover:underline"
                                      >
                                        {gif === "loading" ? "Loading…" : showGif ? "Hide demo" : "Show demo"}
                                      </button>
                                      {showGif && gif && typeof gif === "object" && gif.gifUrl && (
                                        <div className="mt-1.5 space-y-1">
                                          <img src={gif.gifUrl} alt={exercise.name} className="rounded-lg max-h-28 object-contain bg-[var(--surface-elevated)]" />
                                          {gif.targetMuscles?.length ? <p className="text-[10px] text-[var(--muted)]">Target: {gif.targetMuscles.join(", ")}</p> : null}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}
                              </>
                            ) : (
                              /* ── Read mode: clean layout with reps, sets, rest + demo GIF ── */
                              <div className="flex items-start gap-3">
                                <input
                                  type="checkbox"
                                  checked={isDone}
                                  onChange={() => toggleComplete(day, exercise)}
                                  aria-label={`Mark ${exercise.name || "exercise"} complete`}
                                  className="mt-1 h-4 w-4 flex-shrink-0 accent-[var(--accent)]"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className={`font-medium text-sm ${isDone ? "line-through text-[var(--muted)]" : ""}`}>
                                      {exercise.name}
                                    </p>
                                    {(() => {
                                      const gifKey = exercise.name.toLowerCase().trim();
                                      const gif = exerciseGifs[gifKey];
                                      const isExpanded = expandedExerciseDemos.has(gifKey);
                                      const showGif = typeof gif === "object" && gif.gifUrl && isExpanded;
                                      return (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (isExpanded) setExpandedExerciseDemos((prev) => { const n = new Set(prev); n.delete(gifKey); return n; });
                                            else { setExpandedExerciseDemos((prev) => new Set(prev).add(gifKey)); fetchExerciseGif(exercise.name); }
                                          }}
                                          className="text-xs font-medium text-[var(--accent)] hover:underline"
                                        >
                                          {gif === "loading" ? "Loading…" : showGif ? "Hide demo" : "Show demo"}
                                        </button>
                                      );
                                    })()}
                                  </div>
                                  <div className="mt-1.5 flex flex-wrap gap-2">
                                    <span className="inline-flex items-center gap-1 rounded-md bg-[var(--surface-elevated)] px-2 py-0.5 text-xs">
                                      <span className="font-semibold text-[var(--foreground)]">{exercise.sets}</span>
                                      <span className="text-[var(--muted)]">sets</span>
                                    </span>
                                    <span className="inline-flex items-center gap-1 rounded-md bg-[var(--surface-elevated)] px-2 py-0.5 text-xs">
                                      <span className="font-semibold text-[var(--foreground)]">{exercise.reps}</span>
                                      <span className="text-[var(--muted)]">reps</span>
                                    </span>
                                    {restTime && (
                                      <span className="inline-flex items-center gap-1 rounded-md bg-[var(--accent-warm)]/10 px-2 py-0.5 text-xs">
                                        <span className="font-semibold text-[var(--accent-warm)]">{restTime}</span>
                                        <span className="text-[var(--muted)]">rest</span>
                                      </span>
                                    )}
                                  </div>
                                  {(() => {
                                    const gifKey = exercise.name.toLowerCase().trim();
                                    const gif = exerciseGifs[gifKey];
                                    const isExpanded = expandedExerciseDemos.has(gifKey);
                                    const showGif = typeof gif === "object" && gif.gifUrl && isExpanded;
                                    if (!showGif) return null;
                                    return (
                                      <div className="mt-2 space-y-1">
                                        <img src={gif.gifUrl} alt={exercise.name} className="rounded-lg max-h-32 object-contain bg-[var(--surface-elevated)]" />
                                        {gif.targetMuscles?.length ? (
                                          <p className="text-[10px] text-[var(--muted)]">Target: {gif.targetMuscles.join(", ")}</p>
                                        ) : null}
                                      </div>
                                    );
                                  })()}
                                  {exercise.notes && !restTime && (
                                    <p className="mt-1 text-xs text-[var(--muted)] italic">{exercise.notes}</p>
                                  )}
                                  {exercise.notes && restTime && exercise.notes.replace(/rest[:\s]*\d+[\s-]*\d*\s*(?:sec|s|min|m|seconds|minutes)?/i, "").trim() && (
                                    <p className="mt-1 text-xs text-[var(--muted)] italic">
                                      {exercise.notes.replace(/rest[:\s]*\d+[\s-]*\d*\s*(?:sec|s|min|m|seconds|minutes)?/i, "").replace(/^[,\s|]+|[,\s|]+$/g, "").trim()}
                                    </p>
                                  )}
                                  {isDone && completedAt && (
                                    <p className="mt-1 text-[10px] text-[var(--accent)]">
                                      Completed {new Date(completedAt).toLocaleString()}
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {isEditing && (
                    <button
                      onClick={() =>
                        updateDay(dayIndex, (d) => ({
                          ...d,
                          exercises: [...d.exercises, { name: "New exercise", sets: "3", reps: "10-12", notes: "rest: 60s" }],
                        }))
                      }
                      className="btn-secondary px-3 py-1 text-sm"
                    >
                      + Add exercise
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Empty state when calendar is open but no workout matches */}
        {calendarOpen && matchDayToDate(selectedDate) === null && (
          <div className="card px-5 py-8 text-center">
            <p className="text-sm text-[var(--muted)]">No workout scheduled for this day.</p>
            <p className="mt-1 text-xs text-[var(--muted)]">Select a different date or close the calendar to see all days.</p>
          </div>
        )}
      </div>
    </div>
  );
}
