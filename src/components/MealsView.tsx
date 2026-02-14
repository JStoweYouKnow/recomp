"use client";

import { useState, useMemo } from "react";
import { getMealEmbeddings, saveMealEmbeddings } from "@/lib/storage";
import type { MealEntry, Macros } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";
import { CalendarView } from "./CalendarView";

export function MealsView({
  meals,
  todaysMeals,
  todaysTotals,
  targets,
  onAddMeal,
  onDeleteMeal,
}: {
  meals: MealEntry[];
  todaysMeals: MealEntry[];
  todaysTotals: Macros;
  targets: Macros;
  onAddMeal: (m: MealEntry) => void;
  onDeleteMeal: (id: string) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
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
  const [cookingTab, setCookingTab] = useState<"off" | "connect" | "import" | "history">("off");
  const [cookingProvider, setCookingProvider] = useState<string>("cronometer");
  const [cookingConnecting, setCookingConnecting] = useState(false);
  const [cookingConnections, setCookingConnections] = useState<{ provider: string; label: string; connectedAt: string; webhookSecret?: string }[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem("recomp_cooking_apps") ?? "[]"); } catch { return []; }
  });
  const [cookingImportLoading, setCookingImportLoading] = useState(false);
  const [cookingImportResult, setCookingImportResult] = useState<{ imported: number; meals: MealEntry[] } | null>(null);

  const remainingCal = Math.max(0, targets.calories - displayTotals.calories);
  const remainingPro = Math.max(0, targets.protein - displayTotals.protein);

  const handleSuggest = async () => {
    setSuggestLoading(true);
    try {
      const res = await fetch("/api/meals/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mealType,
          remainingCalories: remainingCal || 500,
          remainingProtein: remainingPro || 30,
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
      alert("Voice not supported in this browser. Try Chrome.");
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
      let data: { nutrition?: { calories?: number; protein?: number; carbs?: number; fat?: number }; demoMode?: boolean; source?: string } | null = null;
      const actRes = await fetch("/api/act/nutrition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ food }),
      });
      const actData = await actRes.json();
      if (actRes.ok && actData?.nutrition && !actData.note?.includes("Estimated values")) {
        data = actData;
        setNutritionSource(actData.demoMode ? "estimated" : "usda");
      }
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
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowAdd(true)} className="btn-primary">+ Log a meal</button>
          <button onClick={handleVoiceLog} disabled={voiceLoading} className="btn-secondary !text-xs disabled:opacity-50">
            {voiceLoading ? "Listening…" : "Voice log"}
          </button>
          <label className="btn-secondary !text-xs cursor-pointer">
            <input type="file" accept="image/*" className="hidden" onChange={handlePhotoLog} disabled={photoLoading} />
            {photoLoading ? "Analyzing…" : "Snap plate"}
          </label>
          <label className="btn-secondary !text-xs cursor-pointer">
            <input type="file" accept="image/*" className="hidden" onChange={handleReceiptScan} disabled={receiptLoading} />
            {receiptLoading ? "Scanning…" : "Scan receipt"}
          </label>
        </div>
      ) : (
        <div className="card p-6 animate-slide-up">
          <h3 className="section-title !text-base mb-4">Add meal</h3>
          <button
            type="button"
            onClick={handleSuggest}
            disabled={suggestLoading}
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
            <input
              placeholder="Meal name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-base rounded-lg px-4 py-2 text-[var(--foreground)]"
            />
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
            {(["connect", "import", "history"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setCookingTab(cookingTab === t ? "off" : t)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                  cookingTab === t
                    ? "bg-[var(--accent)] text-white"
                    : "bg-[var(--surface-elevated)] text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                {t === "connect" ? "Connect" : t === "import" ? "Import" : "History"}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-[var(--muted)] mb-3">
          Import meals from Cronometer, MyFitnessPal, Yummly, LoseIt, and more. Nutritional info and calorie counts sync automatically.
        </p>

        {cookingTab === "connect" && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <select
                value={cookingProvider}
                onChange={(e) => setCookingProvider(e.target.value)}
                className="input-base rounded-lg px-3 py-2 text-sm flex-1"
              >
                {["cronometer", "myfitnesspal", "yummly", "whisk", "mealime", "paprika", "loseit", "custom"].map((p) => (
                  <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
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
                      const conn = { provider: data.provider, label: data.label, connectedAt: data.connectedAt, webhookSecret: data.webhookSecret };
                      const next = [...cookingConnections.filter((c) => c.provider !== conn.provider), conn];
                      setCookingConnections(next);
                      localStorage.setItem("recomp_cooking_apps", JSON.stringify(next));
                      alert(`Connected! Webhook URL:\n${data.webhookUrl}\n\nSecret: ${data.webhookSecret}\n\n${data.instructions}`);
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
                        alert(data.error || "Import failed");
                      }
                    } catch (err) { console.error(err); alert("Import failed"); }
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
                    alert(data.error || "Import failed");
                  }
                } catch (err) { console.error(err); alert("Import failed"); }
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
                <div className="flex gap-2 mt-2">
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
          <p className="text-sm text-[var(--muted)]">
            {isViewingToday
              ? "No meals logged yet. Use the buttons above to get started."
              : "No meals logged for this date."}
          </p>
        ) : (
          <ul className="space-y-2">
            {displayMeals.map((m) => (
              <li key={m.id} className="flex items-center justify-between card px-4 py-3">
                <div>
                  <p className="text-sm font-semibold">{m.name}</p>
                  <p className="text-caption">{m.macros.calories} cal · {m.macros.protein}g P · {m.macros.carbs}g C · {m.macros.fat}g F</p>
                </div>
                <button onClick={() => onDeleteMeal(m.id)} className="btn-ghost !text-xs text-[var(--muted)] hover:text-[var(--accent-terracotta)]">Delete</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
