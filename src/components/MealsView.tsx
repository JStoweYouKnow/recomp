"use client";

import { useState, useMemo, useEffect } from "react";
import { getMealEmbeddings, saveMealEmbeddings, getCookingAppRecipes, saveCookingAppRecipes, getProfile } from "@/lib/storage";
import { getTodayLocal } from "@/lib/date-utils";
import { useToast } from "@/components/Toast";
import { callActDirect, isActServiceConfigured } from "@/lib/act-client";
import type { MealEntry, Macros, CookingAppRecipe } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";
import { CalendarView } from "./CalendarView";

export function MealsView({
  meals,
  todaysMeals,
  todaysTotals,
  targets,
  onAddMeal,
  onEditMeal,
  onDeleteMeal,
}: {
  meals: MealEntry[];
  todaysMeals: MealEntry[];
  todaysTotals: Macros;
  targets: Macros;
  onAddMeal: (m: MealEntry) => void;
  onEditMeal: (m: MealEntry) => void;
  onDeleteMeal: (id: string) => void;
}) {
  const today = getTodayLocal();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(today);

  // Dates that have meal entries (for dot indicators + counts)
  const mealDates = useMemo(() => new Set(meals.map((m) => m.date)), [meals]);
  const mealCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of meals) {
      map.set(m.date, (map.get(m.date) ?? 0) + 1);
    }
    return map;
  }, [meals]);

  // Meals for the selected date (falls back to todaysMeals when calendar is closed)
  const displayMeals = useMemo(() => {
    if (!calendarOpen || selectedDate === today) return todaysMeals;
    return meals.filter((m) => m.date === selectedDate);
  }, [calendarOpen, selectedDate, today, todaysMeals, meals]);

  const displayTotals = useMemo(() => {
    if (!calendarOpen || selectedDate === today) return todaysTotals;
    return displayMeals.reduce(
      (acc, m) => ({
        calories: acc.calories + m.macros.calories,
        protein: acc.protein + m.macros.protein,
        carbs: acc.carbs + m.macros.carbs,
        fat: acc.fat + m.macros.fat,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
  }, [calendarOpen, selectedDate, today, todaysTotals, displayMeals]);

  const isViewingToday = !calendarOpen || selectedDate === today;

  const dateLabel = useMemo(() => {
    if (isViewingToday) return "Today";
    const d = new Date(selectedDate + "T12:00:00");
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }, [isViewingToday, selectedDate]);
  const [showAdd, setShowAdd] = useState(false);
  const [editDraft, setEditDraft] = useState<MealEntry | null>(null);
  const [name, setName] = useState("");
  const [mealType, setMealType] = useState<MealEntry["mealType"]>("lunch");
  const [cal, setCal] = useState("");
  const [pro, setPro] = useState("");
  const [carb, setCarb] = useState("");
  const [fat, setFat] = useState("");
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptItems, setReceiptItems] = useState<{ name: string; quantity?: string; calories: number; protein: number; carbs: number; fat: number; selected?: boolean }[]>([]);
  const [nutritionLookupLoading, setNutritionLookupLoading] = useState(false);
  const [nutritionSource, setNutritionSource] = useState<"usda" | "web" | "estimated" | null>(null);
  const [inspirationLoading, setInspirationLoading] = useState(false);
  const [inspirationImage, setInspirationImage] = useState<string | null>(null);
  const [cookingTab, setCookingTab] = useState<"off" | "connect" | "import" | "recipes" | "history">("off");
  const [recipeLibrary, setRecipeLibrary] = useState<CookingAppRecipe[]>(() => getCookingAppRecipes());
  const [cookingProvider, setCookingProvider] = useState<string>("cronometer");
  const [cookingConnecting, setCookingConnecting] = useState(false);
  const [cookingConnections, setCookingConnections] = useState<{ provider: string; label: string; connectedAt: string; webhookSecret?: string }[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem("recomp_cooking_apps") ?? "[]"); } catch { return []; }
  });
  const [cookingImportLoading, setCookingImportLoading] = useState(false);
  const [cookingImportResult, setCookingImportResult] = useState<{ imported: number; meals: MealEntry[] } | null>(null);
  const [webhookVerifyLoading, setWebhookVerifyLoading] = useState(false);
  const [webhookVerifyResult, setWebhookVerifyResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null);
  const [similarMeals, setSimilarMeals] = useState<{ name: string; mealId: string }[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const { showToast } = useToast();

  const remainingCal = Math.max(0, targets.calories - displayTotals.calories);
  const remainingPro = Math.max(0, targets.protein - displayTotals.protein);

  /** Nova Embeddings: find past meals similar to current input (cosine similarity). */
  useEffect(() => {
    const q = name.trim();
    if (q.length < 2) {
      setSimilarMeals([]);
      return;
    }
    const stored = getMealEmbeddings();
    if (stored.length === 0) return;
    const timer = setTimeout(async () => {
      setSimilarLoading(true);
      try {
        const res = await fetch("/api/embeddings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: q }),
        });
        const data = await res.json();
        const emb = data.embedding;
        if (!Array.isArray(emb) || emb.length === 0) return;
        const norm = (a: number[]) => Math.sqrt(a.reduce((s, x) => s + x * x, 0));
        const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * (b[i] ?? 0), 0);
        const sims = stored
          .map((e) => ({
            mealId: e.mealId,
            sim: norm(e.embedding) > 0 ? dot(emb, e.embedding) / (norm(emb) * norm(e.embedding)) : 0,
          }))
          .filter((x) => x.sim > 0.5)
          .sort((a, b) => b.sim - a.sim)
          .slice(0, 4);
        const mealMap = new Map(meals.map((m) => [m.id, m.name]));
        const out = sims
          .map((s) => ({ name: mealMap.get(s.mealId) ?? "Meal", mealId: s.mealId }))
          .filter((x) => x.name !== "Meal" || x.mealId);
        setSimilarMeals(out);
      } catch {
        setSimilarMeals([]);
      } finally {
        setSimilarLoading(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [name, meals]);

  const handleSuggest = async () => {
    setSuggestLoading(true);
    try {
      const profile = getProfile();
      const recipes = getCookingAppRecipes();
      const res = await fetch("/api/meals/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mealType,
          remainingCalories: remainingCal || 500,
          remainingProtein: remainingPro || 30,
          restrictions: profile?.dietaryRestrictions ?? [],
          goal: profile?.goal,
          recipes: recipes.map((r) => ({
            name: r.name,
            description: r.description,
            calories: r.calories,
            protein: r.protein,
            carbs: r.carbs,
            fat: r.fat,
          })),
        }),
      });
      const data = await res.json();
      if (data.suggestions?.[0]) {
        const s = data.suggestions[0];
        setName(s.name ?? "");
        setCal(String(s.calories ?? ""));
        setPro(String(s.protein ?? ""));
        setCarb(String(s.carbs ?? ""));
        setFat(String(s.fat ?? ""));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSuggestLoading(false);
    }
  };

  const handleVoiceLog = () => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      showToast("Voice not supported in this browser. Try Chrome.", "info");
      return;
    }
    setVoiceLoading(true);
    setShowAdd(true);
    const SR = (window as unknown as { webkitSpeechRecognition?: unknown; SpeechRecognition?: unknown }).webkitSpeechRecognition ?? (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
    if (!SR || typeof SR !== "function") return setVoiceLoading(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec = new (SR as any)();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.onresult = async (e: { results: ArrayLike<{ [j: number]: { transcript?: string } }> }) => {
      const last = e.results[(e.results as { length: number }).length - 1];
      const t = last?.[0]?.transcript;
      if (t) {
        try {
          const res = await fetch("/api/voice/parse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transcript: t }) });
          const d = await res.json();
          setName(d.name || t);
          setCal(String(d.calories ?? ""));
          setPro(String(d.protein ?? ""));
          setCarb(String(d.carbs ?? ""));
          setFat(String(d.fat ?? ""));
        } catch {
          setName(t);
        }
      }
      setVoiceLoading(false);
    };
    rec.onerror = () => setVoiceLoading(false);
    rec.start();
  };

  const handlePhotoLog = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoLoading(true);
    setShowAdd(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch("/api/meals/analyze-photo", { method: "POST", body: fd });
      const d = await res.json();
      setName(d.name ?? "Meal");
      setCal(String(d.calories ?? ""));
      setPro(String(d.protein ?? ""));
      setCarb(String(d.carbs ?? ""));
      setFat(String(d.fat ?? ""));
    } catch {
      setName("Meal from photo");
    }
    setPhotoLoading(false);
    e.target.value = "";
  };

  const handleReceiptScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReceiptLoading(true);
    setReceiptItems([]);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch("/api/meals/analyze-receipt", { method: "POST", body: fd });
      const data = await res.json();
      if (data.items && Array.isArray(data.items)) {
        setReceiptItems(data.items.map((item: { name: string; quantity?: string; calories: number; protein: number; carbs: number; fat: number }) => ({ ...item, selected: true })));
      }
    } catch {
      // silently fail
    }
    setReceiptLoading(false);
    e.target.value = "";
  };

  /** Date to assign to new meals — uses calendar selection when open, otherwise today */
  const activeDate = calendarOpen ? selectedDate : today;

  const handleAddReceiptItems = () => {
    const selected = receiptItems.filter((item) => item.selected);
    for (const item of selected) {
      const meal: MealEntry = {
        id: uuidv4(),
        date: activeDate,
        mealType: "snack",
        name: item.name,
        macros: { calories: item.calories || 0, protein: item.protein || 0, carbs: item.carbs || 0, fat: item.fat || 0 },
        loggedAt: new Date().toISOString(),
      };
      onAddMeal(meal);
      embedMealBackground(meal);
    }
    setReceiptItems([]);
  };

  const embedMealBackground = (meal: MealEntry) => {
    fetch("/api/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `${meal.name} ${meal.mealType} ${meal.macros.calories} calories` }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (!Array.isArray(data.embedding)) return;
        const existing = getMealEmbeddings().filter((e) => e.mealId !== meal.id);
        saveMealEmbeddings([...existing, { mealId: meal.id, embedding: data.embedding }]);
      })
      .catch(() => {});
  };

  const handleNutritionLookup = async () => {
    const food = name.trim();
    if (!food) return;
    setNutritionLookupLoading(true);
    setNutritionSource(null);
    try {
      type NutritionData = { nutrition?: { calories?: number; protein?: number; carbs?: number; fat?: number }; demoMode?: boolean; source?: string; note?: string };
      let data: NutritionData | null = null;
      let actFallback: NutritionData | null = null;
      try {
        let actData: NutritionData | null = null;
        if (isActServiceConfigured()) {
          try {
            actData = await callActDirect<NutritionData>("/nutrition", { food }, { timeoutMs: 240_000 });
          } catch {
            /* Act service (Railway) failed — try API route which has fallbacks */
            const actRes = await fetch("/api/act/nutrition", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ food }),
            });
            if (actRes.ok) actData = await actRes.json();
          }
        } else {
          const actRes = await fetch("/api/act/nutrition", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ food }),
          });
          if (actRes.ok) actData = await actRes.json();
        }
        if (actData?.nutrition && !actData.note?.includes("Estimated values")) {
          data = actData;
          setNutritionSource(actData.demoMode ? "estimated" : "usda");
        } else if (actData?.nutrition) {
          actFallback = actData;
        }
      } catch { /* fall through to web lookup */ }
      if (!data?.nutrition) {
        const webRes = await fetch("/api/meals/lookup-nutrition-web", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ food }),
        });
        const webData = await webRes.json();
        if (webRes.ok && webData?.nutrition) {
          data = webData;
          setNutritionSource("web");
        }
      }
      if (!data?.nutrition && actFallback?.nutrition) {
        data = actFallback;
        setNutritionSource("estimated");
      }
      if (data?.nutrition) {
        setCal(String(data.nutrition.calories ?? ""));
        setPro(String(data.nutrition.protein ?? ""));
        setCarb(String(data.nutrition.carbs ?? ""));
        setFat(String(data.nutrition.fat ?? ""));
      }
    } catch {
      // best effort helper
    } finally {
      setNutritionLookupLoading(false);
    }
  };

  const handleGenerateInspiration = async () => {
    const prompt = name.trim() || "Healthy high-protein meal bowl";
    setInspirationLoading(true);
    setInspirationImage(null);
    try {
      const res = await fetch("/api/images/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, type: "meal" }),
      });
      const data = await res.json();
      if (data.image) setInspirationImage(data.image);
    } catch {
      setInspirationImage(null);
    } finally {
      setInspirationLoading(false);
    }
  };

  const handleAdd = () => {
    setNutritionSource(null);
    const c = parseInt(cal) || 0, p = parseInt(pro) || 0, cb = parseInt(carb) || 0, f = parseInt(fat) || 0;
    const meal: MealEntry = {
      id: uuidv4(),
      date: activeDate,
      mealType,
      name: name || mealType,
      macros: { calories: c, protein: p, carbs: cb, fat: f },
      loggedAt: new Date().toISOString(),
    };
    onAddMeal(meal);
    embedMealBackground(meal);
    setName("");
    setCal("");
    setPro("");
    setCarb("");
    setFat("");
    setInspirationImage(null);
    setShowAdd(false);
  };

  const handleSaveEdit = () => {
    if (!editDraft) return;
    const updated: MealEntry = {
      ...editDraft,
      name: editDraft.name.trim() || editDraft.mealType,
      macros: {
        calories: editDraft.macros.calories ?? 0,
        protein: editDraft.macros.protein ?? 0,
        carbs: editDraft.macros.carbs ?? 0,
        fat: editDraft.macros.fat ?? 0,
      },
    };
    onEditMeal(updated);
    setEditDraft(null);
    if (updated.date !== selectedDate) {
      setSelectedDate(updated.date);
      setCalendarOpen(true);
    }
    showToast?.("Meal updated");
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="section-title !text-xl">Meal tracking</h2>
          <p className="section-subtitle">Log meals, scan photos, and track your daily macros</p>
        </div>
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
      </div>

      {/* Calendar */}
      {calendarOpen && (
        <div className="card p-4 animate-slide-up">
          <CalendarView
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            dotDates={mealDates}
            dateCounts={mealCounts}
            daySummary={
              displayMeals.length > 0 ? (
                <div className="text-xs text-[var(--muted)] space-y-0.5">
                  <p className="font-medium text-[var(--foreground)]">{displayMeals.length} meal{displayMeals.length !== 1 ? "s" : ""} logged</p>
                  <p>{displayTotals.calories} cal · {displayTotals.protein}g P · {displayTotals.carbs}g C · {displayTotals.fat}g F</p>
                </div>
              ) : undefined
            }
          />
        </div>
      )}

      {/* Compact macro summary */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        {(["calories", "protein", "carbs", "fat"] as const).map((k) => (
          <div key={k} className="stat-card !p-4">
            <p className="stat-label">{k}</p>
            <p className="text-lg font-bold">{displayTotals[k]} <span className="stat-value-dim !text-sm">/ {targets[k]}{k !== "calories" ? "g" : ""}</span></p>
          </div>
        ))}
      </div>

      {!showAdd ? (
        <div className="space-y-2">
          <p className="text-xs text-[var(--muted)]">Log with one tap, or use voice or a photo for faster entry.</p>
          <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowAdd(true)} className="btn-primary">+ Log a meal</button>
          <button onClick={handleVoiceLog} disabled={voiceLoading} className="btn-secondary !text-xs disabled:opacity-50" title="Describe your meal by voice">
            {voiceLoading ? "Listening…" : "Voice log"}
          </button>
          <label className="btn-secondary !text-xs cursor-pointer" title="Take a photo of your plate to estimate macros">
            <input type="file" accept="image/*" className="hidden" onChange={handlePhotoLog} disabled={photoLoading} />
            {photoLoading ? "Analyzing…" : "Snap plate"}
          </label>
          <label className="btn-secondary !text-xs cursor-pointer" title="Photo of receipt to log items">
            <input type="file" accept="image/*" className="hidden" onChange={handleReceiptScan} disabled={receiptLoading} />
            {receiptLoading ? "Scanning…" : "Scan receipt"}
          </label>
          </div>
        </div>
      ) : (
        <div className="card p-6 animate-slide-up">
          <h3 className="section-title !text-base mb-1">Add meal</h3>
          <p className="text-sm text-[var(--muted)] mb-4">Enter a name, or use the buttons below to fill in quickly.</p>
          <button
            type="button"
            onClick={handleSuggest}
            disabled={suggestLoading}
            title={getCookingAppRecipes().length > 0 ? "Suggestions prefer gourmet options from your recipe library within your calorie budget" : "Get meal ideas that fit your remaining calories"}
            className="mb-4 rounded-lg border border-[var(--accent)] px-4 py-2 text-sm text-[var(--accent)] bg-[var(--accent-10)] hover:bg-[var(--accent-20)] disabled:opacity-50"
          >
            {suggestLoading ? "Getting Nova suggestions…" : "✨ AI suggest meal"}
          </button>
          <div className="mb-4 flex flex-wrap gap-2">
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={handleNutritionLookup}
                disabled={nutritionLookupLoading || !name.trim()}
                className="rounded-lg border border-[var(--accent-sage)] bg-[var(--accent-sage)]/10 px-4 py-2 text-sm text-[var(--accent-sage)] disabled:opacity-50"
              >
                {nutritionLookupLoading ? "Looking up nutrition..." : "Auto-fill nutrition"}
              </button>
              {nutritionSource && (
                <span className="text-[10px] text-[var(--muted)]">
                  {nutritionSource === "usda" && "Source: USDA FoodData Central"}
                  {nutritionSource === "web" && "Source: web search"}
                  {nutritionSource === "estimated" && "Estimated — install nova-act for real USDA lookup"}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={handleGenerateInspiration}
              disabled={inspirationLoading}
              className="rounded-lg border border-[var(--accent-warm)] bg-[var(--accent-warm-10)] px-4 py-2 text-sm text-[var(--accent-warm)] disabled:opacity-50"
            >
              {inspirationLoading ? "Generating visual..." : "Generate meal visual"}
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className="label !mb-0">Meal name</label>
              <input
                placeholder="e.g. Grilled chicken salad"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-base rounded-lg px-4 py-2 text-[var(--foreground)]"
              />
              {(similarMeals.length > 0 || (name.trim().length >= 2 && getMealEmbeddings().length === 0 && !similarLoading)) && (
                <p className="text-[10px] text-[var(--muted)] mt-1">
                  {similarMeals.length > 0 ? (
                    <>
                      Similar to past meals:{" "}
                      {similarMeals.map((s) => (
                        <button
                          key={s.mealId}
                          type="button"
                          onClick={() => setName(s.name)}
                          className="text-[var(--accent)] hover:underline mr-1"
                        >
                          {s.name}
                        </button>
                      ))}
                      {similarLoading && "…"}
                    </>
                  ) : (
                    <span>Log meals to get smart suggestions based on your history.</span>
                  )}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label className="label !mb-0">Meal type</label>
              <select
                value={mealType}
                onChange={(e) => setMealType(e.target.value as MealEntry["mealType"])}
                className="input-base rounded-lg px-4 py-2 text-[var(--foreground)]"
              >
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="dinner">Dinner</option>
              <option value="snack">Snack</option>
              </select>
            </div>
            <input type="number" placeholder="Calories" value={cal} onChange={(e) => setCal(e.target.value)} className="input-base rounded-lg px-4 py-2 text-[var(--foreground)]" />
            <input type="number" placeholder="Protein (g)" value={pro} onChange={(e) => setPro(e.target.value)} className="input-base rounded-lg px-4 py-2 text-[var(--foreground)]" />
            <input type="number" placeholder="Carbs (g)" value={carb} onChange={(e) => setCarb(e.target.value)} className="input-base rounded-lg px-4 py-2 text-[var(--foreground)]" />
            <input type="number" placeholder="Fat (g)" value={fat} onChange={(e) => setFat(e.target.value)} className="input-base rounded-lg px-4 py-2 text-[var(--foreground)]" />
          </div>
          {inspirationImage && (
            <img
              src={`data:image/png;base64,${inspirationImage}`}
              alt="Meal inspiration"
              className="mt-4 max-h-52 rounded-lg object-cover"
            />
          )}
          <div className="mt-4 flex gap-2">
            <button onClick={handleAdd} className="btn-primary rounded-lg px-4 py-2">
              Save
            </button>
            <button onClick={() => setShowAdd(false)} className="rounded-lg border border-[var(--border)] px-4 py-2 text-[var(--muted)] hover:bg-[var(--surface-elevated)]">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ─── Cooking App Integration ─── */}
      <div className="card rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Cooking App Sync</h3>
          <div className="flex gap-1">
            {(["connect", "import", "recipes", "history"] as const).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setCookingTab(cookingTab === t ? "off" : t);
                  if (t === "recipes") setRecipeLibrary(getCookingAppRecipes());
                }}
                className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                  cookingTab === t
                    ? "bg-[var(--accent)] text-white"
                    : "bg-[var(--surface-elevated)] text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                {t === "connect" ? "Connect" : t === "import" ? "Import" : t === "recipes" ? "Recipes" : "History"}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-[var(--muted)] mb-3">
          Apps that support webhooks (Whisk, Yummly, etc.) can push meals via Connect. Apps like Recipe Keeper and NYT Cooking don’t support webhooks — use the <strong>Import</strong> tab to paste or upload recipe text and we’ll parse it with AI.
        </p>

        {cookingTab === "connect" && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <select
                value={cookingProvider}
                onChange={(e) => setCookingProvider(e.target.value)}
                className="input-base rounded-lg px-3 py-2 text-sm flex-1"
              >
                {[
                  "cronometer", "myfitnesspal", "yummly", "whisk", "mealime", "paprika", "loseit",
                  "recipekeeper", "nytcooking", "custom",
                ].map((p) => (
                  <option key={p} value={p}>
                    {p === "recipekeeper" ? "Recipe Keeper" : p === "nytcooking" ? "NYT Cooking" : p.charAt(0).toUpperCase() + p.slice(1)}
                  </option>
                ))}
              </select>
              <button
                onClick={async () => {
                  setCookingConnecting(true);
                  try {
                    const res = await fetch("/api/cooking/connect", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ provider: cookingProvider }),
                    });
                    const data = await res.json();
                    if (res.ok) {
                      const conn = { provider: data.provider, label: data.label, connectedAt: data.connectedAt, webhookSecret: data.webhookSecret, webhookUrl: data.webhookUrl };
                      const next = [...cookingConnections.filter((c) => c.provider !== conn.provider), conn];
                      setCookingConnections(next);
                      localStorage.setItem("recomp_cooking_apps", JSON.stringify(next));
                      showToast("Cooking app connected! Webhook URL and secret saved.", "success");
                    }
                  } catch (e) { console.error(e); }
                  setCookingConnecting(false);
                }}
                disabled={cookingConnecting}
                className="btn-primary rounded-lg px-4 py-2 text-sm disabled:opacity-50"
              >
                {cookingConnecting ? "Connecting…" : "Connect"}
              </button>
            </div>
            {cookingConnections.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-[var(--muted)]">Connected apps:</p>
                {cookingConnections.map((c) => (
                  <div key={c.provider} className="flex items-center justify-between rounded-lg bg-[var(--surface-elevated)] px-3 py-2 text-sm">
                    <span className="font-medium">{c.label || c.provider}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--muted)]">
                        since {new Date(c.connectedAt).toLocaleDateString()}
                      </span>
                      <button
                        onClick={async () => {
                          await fetch("/api/cooking/connect", {
                            method: "DELETE",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ provider: c.provider }),
                          });
                          const next = cookingConnections.filter((x) => x.provider !== c.provider);
                          setCookingConnections(next);
                          localStorage.setItem("recomp_cooking_apps", JSON.stringify(next));
                        }}
                        className="text-xs text-[var(--muted)] hover:text-[#9b6b5c]"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-3 mt-3 border-t border-[var(--border-soft)]">
              <p className="text-xs font-medium text-[var(--muted)] mb-2">Verify webhook connection</p>
              <p className="text-xs text-[var(--muted)] mb-2">
                Sends a signed test request to the webhook. Confirms that COOKING_WEBHOOK_SECRET is set and the endpoint accepts it.
              </p>
              <button
                type="button"
                onClick={async () => {
                  setWebhookVerifyResult(null);
                  setWebhookVerifyLoading(true);
                  try {
                    const res = await fetch("/api/cooking/webhook/test", { method: "POST" });
                    const data = await res.json();
                    setWebhookVerifyResult({
                      success: data.success === true,
                      message: data.message,
                      error: data.error,
                    });
                  } catch {
                    setWebhookVerifyResult({ success: false, error: "Request failed" });
                  } finally {
                    setWebhookVerifyLoading(false);
                  }
                }}
                disabled={webhookVerifyLoading}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--foreground)] hover:bg-[var(--surface-elevated)] disabled:opacity-50"
              >
                {webhookVerifyLoading ? "Testing…" : "Test connection"}
              </button>
              {webhookVerifyResult && (
                <div
                  className={`mt-2 rounded-lg px-3 py-2 text-sm ${webhookVerifyResult.success ? "bg-[var(--accent)]/10 text-[var(--accent)]" : "bg-[var(--accent-terracotta)]/10 text-[var(--accent-terracotta)]"}`}
                  role="status"
                >
                  {webhookVerifyResult.success ? (
                    webhookVerifyResult.message ?? "Connection verified."
                  ) : (
                    webhookVerifyResult.error ?? "Verification failed."
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {cookingTab === "import" && (
          <div className="space-y-3">
            <p className="text-xs text-[var(--muted)]">
              Upload a CSV or JSON export from your cooking/nutrition app. Nova AI will parse the data and extract meals with macros.
            </p>
            <div className="flex gap-2">
              <label className="cursor-pointer flex-1 rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-3 text-center text-sm text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition">
                <input
                  type="file"
                  accept=".csv,.json,.txt"
                  className="hidden"
                  disabled={cookingImportLoading}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setCookingImportLoading(true);
                    setCookingImportResult(null);
                    try {
                      const form = new FormData();
                      form.append("file", file);
                      const res = await fetch("/api/cooking/import", { method: "POST", body: form });
                      const data = await res.json();
                      if (res.ok && data.meals) {
                        setCookingImportResult(data);
                      } else {
                        showToast(data.error || "Import failed", "error");
                      }
                    } catch (err) { console.error(err); showToast("Import failed", "error"); }
                    setCookingImportLoading(false);
                    e.target.value = "";
                  }}
                />
                {cookingImportLoading ? "Parsing with Nova AI…" : "Upload CSV / JSON / TXT"}
              </label>
            </div>
            <p className="text-xs text-[var(--muted)]">
              Or paste meal text directly:
            </p>
            <textarea
              id="cooking-paste"
              rows={3}
              placeholder="Paste exported data, a recipe, or a list of meals with nutrition info…"
              className="input-base rounded-lg px-3 py-2 text-sm w-full resize-y"
            />
            <button
              onClick={async () => {
                const el = document.getElementById("cooking-paste") as HTMLTextAreaElement;
                const text = el?.value?.trim();
                if (!text) return;
                setCookingImportLoading(true);
                setCookingImportResult(null);
                try {
                  const res = await fetch("/api/cooking/import", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ data: text }),
                  });
                  const data = await res.json();
                  if (res.ok && data.meals) {
                    setCookingImportResult(data);
                    el.value = "";
                  } else {
                    showToast(data.error || "Import failed", "error");
                  }
                } catch (err) { console.error(err); showToast("Import failed", "error"); }
                setCookingImportLoading(false);
              }}
              disabled={cookingImportLoading}
              className="btn-primary rounded-lg px-4 py-2 text-sm disabled:opacity-50"
            >
              {cookingImportLoading ? "Parsing…" : "Parse & import"}
            </button>

            {cookingImportResult && (
              <div className="rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-4 space-y-2">
                <p className="text-sm font-medium">{cookingImportResult.imported} meal(s) parsed</p>
                {cookingImportResult.meals.map((m, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span>{m.name}</span>
                    <span className="text-xs text-[var(--muted)]">{m.macros.calories} cal · {m.macros.protein}g P · {m.macros.carbs}g C · {m.macros.fat}g F</span>
                  </div>
                ))}
                <div className="flex flex-wrap gap-2 mt-2">
                  <button
                    onClick={() => {
                      cookingImportResult.meals.forEach((m) => onAddMeal(m));
                      setCookingImportResult(null);
                    }}
                    className="btn-primary rounded-lg px-4 py-2 text-sm"
                  >
                    Log all {cookingImportResult.imported} meal(s)
                  </button>
                  <button
                    onClick={() => {
                      const now = new Date().toISOString();
                      const newRecipes: CookingAppRecipe[] = cookingImportResult.meals.map((m) => ({
                        id: `recipe_${Date.now()}_${m.id}`,
                        name: m.name,
                        description: m.notes ?? undefined,
                        calories: m.macros.calories,
                        protein: m.macros.protein,
                        carbs: m.macros.carbs,
                        fat: m.macros.fat,
                        source: "import",
                        addedAt: now,
                      }));
                      const existing = getCookingAppRecipes();
                      const combined = [...existing];
                      for (const r of newRecipes) {
                        if (!combined.some((e) => e.name === r.name && e.calories === r.calories)) combined.push(r);
                      }
                      saveCookingAppRecipes(combined);
                      setRecipeLibrary(combined);
                      setCookingImportResult(null);
                    }}
                    className="rounded-lg border border-[var(--accent)] px-4 py-2 text-sm text-[var(--accent)] hover:bg-[var(--accent)]/10"
                  >
                    Add to recipe library
                  </button>
                  <button
                    onClick={() => setCookingImportResult(null)}
                    className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {cookingTab === "recipes" && (
          <div className="space-y-3">
            <p className="text-xs text-[var(--muted)]">
              Recipes in your library are used when you tap &quot;AI suggest meal&quot; — Nova will prefer gourmet options from this list that fit your remaining calories.
            </p>
            {recipeLibrary.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No recipes yet. Import meals above and click &quot;Add to recipe library&quot; to save them here.</p>
            ) : (
              <ul className="space-y-2 max-h-48 overflow-y-auto">
                {recipeLibrary.map((r) => (
                  <li key={r.id} className="flex items-center justify-between rounded-lg bg-[var(--surface-elevated)] px-3 py-2 text-sm">
                    <div>
                      <span className="font-medium">{r.name}</span>
                      <span className="ml-2 text-xs text-[var(--muted)]">{r.calories} cal · {r.protein}g P</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const next = recipeLibrary.filter((x) => x.id !== r.id);
                        saveCookingAppRecipes(next);
                        setRecipeLibrary(next);
                      }}
                      className="text-xs text-[var(--muted)] hover:text-[var(--accent-terracotta)]"
                      aria-label={`Remove ${r.name}`}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {cookingTab === "history" && (
          <div className="space-y-2">
            <p className="text-xs text-[var(--muted)]">Recent meals imported from cooking apps:</p>
            {meals.filter((m) => m.notes?.includes("via ") || m.notes?.includes("Imported from")).length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No imported meals yet. Connect an app or import data above.</p>
            ) : (
              <ul className="space-y-2 max-h-48 overflow-y-auto">
                {meals
                  .filter((m) => m.notes?.includes("via ") || m.notes?.includes("Imported from"))
                  .slice(-20)
                  .reverse()
                  .map((m) => (
                    <li key={m.id} className="flex items-center justify-between rounded-lg bg-[var(--surface-elevated)] px-3 py-2 text-sm">
                      <div>
                        <p className="font-medium">{m.name}</p>
                        <p className="text-xs text-[var(--muted)]">{m.macros.calories} cal · {m.date} · {m.notes?.split(" | ")[0]}</p>
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {receiptItems.length > 0 && (
        <div className="card rounded-xl p-6">
          <h3 className="mb-3 font-semibold">Receipt items found</h3>
          <p className="mb-3 text-sm text-[var(--muted)]">Select items to log as meals:</p>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {receiptItems.map((item, i) => (
              <label key={i} className="flex items-center gap-3 rounded-lg border border-[var(--border-soft)] px-3 py-2 cursor-pointer hover:bg-[var(--surface-elevated)]">
                <input
                  type="checkbox"
                  checked={item.selected}
                  onChange={() => setReceiptItems((prev) => prev.map((it, j) => j === i ? { ...it, selected: !it.selected } : it))}
                  className="accent-[var(--accent)]"
                />
                <span className="flex-1 text-sm">{item.name} {item.quantity ? `(${item.quantity})` : ""}</span>
                <span className="text-xs text-[var(--muted)]">{item.calories} cal · {item.protein}g P</span>
              </label>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={handleAddReceiptItems} className="btn-primary rounded-lg px-4 py-2 text-sm">
              Log selected ({receiptItems.filter((i) => i.selected).length})
            </button>
            <button onClick={() => setReceiptItems([])} className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div>
        <h3 className="section-title !text-base mb-3">{dateLabel}&apos;s meals</h3>
        {displayMeals.length === 0 ? (
          <div className={`rounded-xl border border-dashed border-[var(--border-soft)] bg-[var(--surface-elevated)]/50 p-8 text-center ${isViewingToday ? "animate-fade-in" : ""}`}>
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)] mb-4" aria-hidden>
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v10.024c0 1.135.845 2.098 1.976 2.192.332.05.664.083 1.002.083.337 0 .67-.033 1.003-.083C10.303 20.944 11.645 21 13 21c1.355 0 2.697-.056 4.024-.166C18.155 20.49 19 19.527 19 18.392V10.608c0-1.135-.845-2.098-1.976-2.192A13.413 13.413 0 0013 8.25m0 0l.001-.001" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-[var(--foreground)]">
              {isViewingToday ? "Log your first meal" : "No meals for this date"}
            </p>
            <p className="mt-1.5 text-sm text-[var(--muted)]">
              {isViewingToday
                ? "Try one of these quick options to get started."
                : "Log meals on that day or switch to today."}
            </p>
            {isViewingToday && (
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button onClick={() => setShowAdd(true)} className="btn-primary !text-xs">
                  Add manually
                </button>
                <button onClick={handleVoiceLog} disabled={voiceLoading} className="btn-secondary !text-xs">
                  {voiceLoading ? "Listening…" : "Voice log"}
                </button>
                <label className="btn-secondary !text-xs cursor-pointer">
                  <input type="file" accept="image/*" capture="environment" onChange={handlePhotoLog} className="sr-only" />
                  {photoLoading ? "Analyzing…" : "Snap plate"}
                </label>
              </div>
            )}
          </div>
        ) : (
          <ul className="space-y-2">
            {displayMeals.map((m) => (
              <li key={m.id}>
                {editDraft?.id === m.id ? (
                  <div className="card p-4 space-y-4 animate-slide-up">
                    <h4 className="text-sm font-semibold">Edit meal</h4>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="label !mb-1">Name</label>
                        <input
                          value={editDraft.name}
                          onChange={(e) => setEditDraft((d) => d ? { ...d, name: e.target.value } : null)}
                          className="input-base rounded-lg px-3 py-2 text-sm w-full"
                        />
                      </div>
                      <div>
                        <label className="label !mb-1">Date</label>
                        <input
                          type="date"
                          value={editDraft.date}
                          onChange={(e) => setEditDraft((d) => d ? { ...d, date: e.target.value } : null)}
                          className="input-base rounded-lg px-3 py-2 text-sm w-full"
                        />
                      </div>
                      <div>
                        <label className="label !mb-1">Meal type</label>
                        <select
                          value={editDraft.mealType}
                          onChange={(e) => setEditDraft((d) => d ? { ...d, mealType: e.target.value as MealEntry["mealType"] } : null)}
                          className="input-base rounded-lg px-3 py-2 text-sm w-full"
                        >
                          <option value="breakfast">Breakfast</option>
                          <option value="lunch">Lunch</option>
                          <option value="dinner">Dinner</option>
                          <option value="snack">Snack</option>
                        </select>
                      </div>
                      <div>
                        <label className="label !mb-1">Notes (optional)</label>
                        <input
                          value={editDraft.notes ?? ""}
                          onChange={(e) => setEditDraft((d) => d ? { ...d, notes: e.target.value || undefined } : null)}
                          placeholder="e.g. Restaurant, portion size"
                          className="input-base rounded-lg px-3 py-2 text-sm w-full"
                        />
                      </div>
                      <div className="sm:col-span-2 grid grid-cols-4 gap-2">
                        <div>
                          <label className="label !mb-1">Cal</label>
                          <input
                            type="number"
                            min={0}
                            value={editDraft.macros.calories || ""}
                            onChange={(e) => setEditDraft((d) => d ? { ...d, macros: { ...d.macros, calories: parseInt(e.target.value) || 0 } } : null)}
                            className="input-base rounded-lg px-3 py-2 text-sm w-full"
                          />
                        </div>
                        <div>
                          <label className="label !mb-1">P (g)</label>
                          <input
                            type="number"
                            min={0}
                            value={editDraft.macros.protein || ""}
                            onChange={(e) => setEditDraft((d) => d ? { ...d, macros: { ...d.macros, protein: parseInt(e.target.value) || 0 } } : null)}
                            className="input-base rounded-lg px-3 py-2 text-sm w-full"
                          />
                        </div>
                        <div>
                          <label className="label !mb-1">C (g)</label>
                          <input
                            type="number"
                            min={0}
                            value={editDraft.macros.carbs || ""}
                            onChange={(e) => setEditDraft((d) => d ? { ...d, macros: { ...d.macros, carbs: parseInt(e.target.value) || 0 } } : null)}
                            className="input-base rounded-lg px-3 py-2 text-sm w-full"
                          />
                        </div>
                        <div>
                          <label className="label !mb-1">F (g)</label>
                          <input
                            type="number"
                            min={0}
                            value={editDraft.macros.fat || ""}
                            onChange={(e) => setEditDraft((d) => d ? { ...d, macros: { ...d.macros, fat: parseInt(e.target.value) || 0 } } : null)}
                            className="input-base rounded-lg px-3 py-2 text-sm w-full"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={handleSaveEdit} className="btn-primary !text-sm">Save</button>
                      <button onClick={() => setEditDraft(null)} className="btn-secondary !text-sm">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between card px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold">{m.name}</p>
                      <p className="text-caption">{m.macros.calories} cal · {m.macros.protein}g P · {m.macros.carbs}g C · {m.macros.fat}g F</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setEditDraft({ ...m })} className="btn-ghost !text-xs text-[var(--muted)] hover:text-[var(--accent)]">Edit</button>
                      <button onClick={() => onDeleteMeal(m.id)} className="btn-ghost !text-xs text-[var(--muted)] hover:text-[var(--accent-terracotta)]">Delete</button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
