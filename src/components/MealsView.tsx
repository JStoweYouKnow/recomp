"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { getMealEmbeddings, saveMealEmbeddings, getCookingAppRecipes, getProfile, getRecentMealTemplates, saveRecentMealTemplate, getNutritionCache, saveNutritionCache, getPantry, getActiveFastingSession, getSavedRestaurantMeals, saveSavedRestaurantMeals, syncToServer } from "@/lib/storage";
import { getTodayLocal, getUpcomingDates } from "@/lib/date-utils";
import { useToast } from "@/components/Toast";
import { callActDirect, isActServiceConfigured } from "@/lib/act-client";
import type { MealEntry, Macros, CookingAppRecipe } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";
import { CalendarView } from "./CalendarView";
import { PantrySection } from "./meals/PantrySection";
import { MealPrepSection } from "./meals/MealPrepSection";
import { CookingAppSync } from "./meals/CookingAppSync";
import { MealList } from "./meals/MealList";

type NutritionData = {
  nutrition?: { calories?: number; protein?: number; carbs?: number; fat?: number };
  demoMode?: boolean;
  source?: string;
  note?: string;
  cached?: boolean;
  _src?: "web";
};

export function MealsView({
  meals,
  todaysMeals,
  todaysTotals,
  targets,
  goal = "maintain",
  onAddMeal,
  onEditMeal,
  onDeleteMeal,
}: {
  meals: MealEntry[];
  todaysMeals: MealEntry[];
  todaysTotals: Macros;
  targets: Macros;
  goal?: string;
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

  const MEAL_CATEGORY_ORDER: MealEntry["mealType"][] = ["breakfast", "lunch", "dinner", "snack"];
  const mealsByCategory = useMemo(() => {
    const groups = new Map<MealEntry["mealType"], MealEntry[]>();
    for (const mt of MEAL_CATEGORY_ORDER) groups.set(mt, []);
    for (const m of displayMeals) {
      const mt = MEAL_CATEGORY_ORDER.includes(m.mealType) ? m.mealType : "snack";
      (groups.get(mt) ?? []).push(m);
    }
    return MEAL_CATEGORY_ORDER.map((mt) => ({ category: mt, meals: groups.get(mt) ?? [] })).filter((g) => g.meals.length > 0);
  }, [displayMeals]);

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
  const [portions, setPortions] = useState(1);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<{ name: string; description?: string; calories?: number; protein?: number; carbs?: number; fat?: number; url?: string }[]>([]);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptItems, setReceiptItems] = useState<{ name: string; quantity?: string; calories: number; protein: number; carbs: number; fat: number; selected?: boolean }[]>([]);
  const [nutritionLookupLoading, setNutritionLookupLoading] = useState(false);
  const [nutritionLookupStatus, setNutritionLookupStatus] = useState<string | null>(null);
  const [nutritionSource, setNutritionSource] = useState<"usda" | "web" | "estimated" | "openfoodfacts" | null>(null);
  const [recipeUrl, setRecipeUrl] = useState("");
  const [recipeUrlLoading, setRecipeUrlLoading] = useState(false);
  const [recipeImageUrl, setRecipeImageUrl] = useState<string | null>(null);
  const [recipeServings, setRecipeServings] = useState<number | null>(null);
  const [inspirationLoading, setInspirationLoading] = useState(false);
  const [inspirationImage, setInspirationImage] = useState<string | null>(null);
  const [similarMeals, setSimilarMeals] = useState<{ name: string; mealId: string }[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [generatePlanLoading, setGeneratePlanLoading] = useState(false);
  const [menuScanLoading, setMenuScanLoading] = useState(false);
  const [menuItems, setMenuItems] = useState<{ name: string; description?: string; estimatedMacros: { calories: number; protein: number; carbs: number; fat: number }; confidence: string }[]>([]);
  const { showToast } = useToast();
  const activeFast = getActiveFastingSession();
  const [savedRestaurantMeals, setSavedRestaurantMeals] = useState(() => getSavedRestaurantMeals());
  const inFlightNutritionLookups = useRef<Map<string, Promise<NutritionData | null>>>(new Map());

  // Upcoming days (next 7) with no logged meals
  const emptyUpcomingDates = useMemo(() => {
    const upcoming = getUpcomingDates(7, today);
    const mealsByDate = new Set(meals.map((m) => m.date));
    return upcoming.filter((d) => !mealsByDate.has(d));
  }, [meals, today]);

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
    setSuggestions([]);
    try {
      const profile = getProfile();
      const pantry = getPantry();
      const recentMealNames = meals.filter((m) => new Date(m.date).getTime() > Date.now() - 2 * 86400000).map((m) => m.name);
      const hour = new Date().getHours();
      const timeOfDay = hour < 11 ? "morning" : hour < 15 ? "midday" : "evening";
      let gotSuggestions = false;

      if (pantry.length >= 3) {
        try {
          const res = await fetch("/api/meals/smart-suggest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              remainingMacros: { calories: remainingCal || 500, protein: remainingPro || 30, carbs: Math.max(0, targets.carbs - displayTotals.carbs), fat: Math.max(0, targets.fat - displayTotals.fat) },
              timeOfDay,
              recentMeals: recentMealNames,
              pantryItems: pantry.map((p) => p.name),
              goal: profile?.goal ?? goal,
              dietaryRestrictions: profile?.dietaryRestrictions ?? [],
            }),
          });
          const data = await res.json();
          if (data.suggestions?.length) {
            setSuggestions(data.suggestions.map((s: { name: string; description?: string; estimatedMacros?: { calories: number; protein: number; carbs: number; fat: number } }) => ({
              name: s.name,
              description: s.description,
              calories: s.estimatedMacros?.calories,
              protein: s.estimatedMacros?.protein,
              carbs: s.estimatedMacros?.carbs,
              fat: s.estimatedMacros?.fat,
            })));
            gotSuggestions = true;
          }
        } catch {
          /* fall through */
        }
      }
      if (!gotSuggestions) {
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
              url: (r as { recipeUrl?: string }).recipeUrl,
            })),
          }),
        });
        const data = await res.json();
        if (data.suggestions?.length) {
          setSuggestions(data.suggestions);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSuggestLoading(false);
    }
  };

  const applySuggestion = (s: { name: string; calories?: number; protein?: number; carbs?: number; fat?: number; url?: string }) => {
    setName(s.name ?? "");
    setCal(String(s.calories ?? ""));
    setPro(String(s.protein ?? ""));
    setCarb(String(s.carbs ?? ""));
    setFat(String(s.fat ?? ""));
    setPortions(1);
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
          setPortions(1);
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
      const { prepareImageForUpload } = await import("@/lib/image-utils");
      const blob = await prepareImageForUpload(file);
      const fd = new FormData();
      fd.append("image", blob, "photo.jpg");
      const res = await fetch("/api/meals/analyze-photo", { method: "POST", body: fd });
      const d = await res.json();
      setName(d.name ?? "Meal");
      setCal(String(d.calories ?? ""));
      setPro(String(d.protein ?? ""));
      setCarb(String(d.carbs ?? ""));
      setFat(String(d.fat ?? ""));
      setPortions(1);
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
      const { prepareImageForUpload } = await import("@/lib/image-utils");
      const blob = await prepareImageForUpload(file);
      const fd = new FormData();
      fd.append("image", blob, "receipt.jpg");
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
      .catch(() => { });
  };

  const handleNutritionLookup = async () => {
    const food = name.trim();
    if (!food) return;
    setNutritionLookupLoading(true);
    setNutritionLookupStatus("Checking local cache...");
    setNutritionSource(null);
    try {
      // ── 1. Check client-side cache (instant) ──
      const localCached = getNutritionCache(food);
      if (localCached) {
        setCal(String(localCached.calories));
        setPro(String(localCached.protein));
        setCarb(String(localCached.carbs));
        setFat(String(localCached.fat));
        setPortions(1);
        const rawCachedSource = String(localCached.source ?? "").toLowerCase();
        const cachedSource = rawCachedSource.includes("openfoodfacts")
          ? "openfoodfacts"
          : rawCachedSource.includes("web")
            ? "web"
            : rawCachedSource.includes("estimated")
              ? "estimated"
              : "usda";
        setNutritionSource(cachedSource);
        return;
      }

      const lookupKey = food.toLowerCase().replace(/\s+/g, " ").trim();
      let lookupPromise = inFlightNutritionLookups.current.get(lookupKey);
      if (!lookupPromise) {
        lookupPromise = (async () => {
          // ── 2. Act API first — always returns nutrition (USDA, Python, or estimated fallback) ──
          let data: NutritionData | null = null;

          setNutritionLookupStatus("Checking nutrition databases...");
          if (isActServiceConfigured()) {
            try {
              const d = await callActDirect<NutritionData>("/nutrition", { food }, { timeoutMs: 240_000 });
              if (d?.nutrition) data = d;
            } catch {
              /* fall through to API */
            }
          }
          if (!data?.nutrition) {
            setNutritionLookupStatus("Running nutrition lookup service...");
            const res = await fetch("/api/act/nutrition", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ food }),
            });
            if (res.ok) {
              const d = (await res.json()) as NutritionData;
              if (d?.nutrition) data = d;
            }
          }

          // ── 3. Web grounding fallback if Act failed or returned error ──
          if (!data?.nutrition) {
            setNutritionLookupStatus("Searching the web for nutrition...");
            try {
              const res = await fetch("/api/meals/lookup-nutrition-web", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ food }),
              });
              if (res.ok) {
                const d = (await res.json()) as NutritionData;
                if (d?.nutrition) data = { ...d, _src: "web" };
              }
            } catch {
              /* web failed */
            }
          }

          return data;
        })().finally(() => {
          inFlightNutritionLookups.current.delete(lookupKey);
        });
        inFlightNutritionLookups.current.set(lookupKey, lookupPromise);
      } else {
        setNutritionLookupStatus("Using active lookup...");
      }

      const data = await lookupPromise;

      if (data?.nutrition) {
        const n = data.nutrition;
        setCal(String(n.calories ?? ""));
        setPro(String(n.protein ?? ""));
        setCarb(String(n.carbs ?? ""));
        setFat(String(n.fat ?? ""));
        setPortions(1);
        const isEstimated = data.demoMode || data.note?.toLowerCase().includes("estimated");
        const rawSource = String(data.source ?? "").toLowerCase();
        const source = isEstimated
          ? "estimated"
          : rawSource.includes("openfoodfacts")
            ? "openfoodfacts"
            : data._src === "web" || rawSource.includes("web")
              ? "web"
              : "usda";
        setNutritionSource(source);
        if (!isEstimated && n.calories != null) {
          saveNutritionCache(food, { calories: n.calories ?? 0, protein: n.protein ?? 0, carbs: n.carbs ?? 0, fat: n.fat ?? 0, source });
        }
      } else {
        showToast?.("Nutrition lookup failed. Try a more specific food name.", "error");
      }
    } catch (err) {
      showToast?.(err instanceof Error ? err.message : "Nutrition lookup failed", "error");
    } finally {
      setNutritionLookupLoading(false);
      setNutritionLookupStatus(null);
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

  const handleRecipeUrlImport = async () => {
    const url = recipeUrl.trim();
    if (!url) return;
    setRecipeUrlLoading(true);
    setRecipeImageUrl(null);
    setRecipeServings(null);
    try {
      const res = await fetch("/api/meals/parse-recipe-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (data.name) setName(data.name);
      if (data.nutrition) {
        setCal(String(data.nutrition.calories ?? ""));
        setPro(String(data.nutrition.protein ?? ""));
        setCarb(String(data.nutrition.carbs ?? ""));
        setFat(String(data.nutrition.fat ?? ""));
        setPortions(1);
      }
      if (data.imageUrl) setRecipeImageUrl(data.imageUrl);
      setRecipeServings(data.servings > 1 ? data.servings : null);
    } catch (err) {
      showToast?.(err instanceof Error ? err.message : "Could not parse recipe URL");
    } finally {
      setRecipeUrlLoading(false);
    }
  };

  const handlePortionsChange = (newPortions: number) => {
    const n = Math.max(0.25, Math.min(100, newPortions));
    if (n === portions) return;
    const ratio = n / portions;
    const hasMacros = cal || pro || carb || fat;
    if (hasMacros && ratio !== 1) {
      const scale = (v: string) => {
        const x = parseFloat(v) || 0;
        return String(Math.round(x * ratio * 10) / 10);
      };
      setCal(scale(cal));
      setPro(scale(pro));
      setCarb(scale(carb));
      setFat(scale(fat));
    }
    setPortions(n);
  };

  const handleAdd = () => {
    setNutritionSource(null);
    const c = Math.round(parseFloat(cal) || 0), p = Math.round(parseFloat(pro) || 0), cb = Math.round(parseFloat(carb) || 0), f = Math.round(parseFloat(fat) || 0);
    const meal: MealEntry = {
      id: uuidv4(),
      date: activeDate,
      mealType,
      name: name || mealType,
      macros: { calories: c, protein: p, carbs: cb, fat: f },
      imageUrl: recipeImageUrl || undefined,
      loggedAt: new Date().toISOString(),
    };
    onAddMeal(meal);
    embedMealBackground(meal);
    saveRecentMealTemplate({ name: meal.name, macros: meal.macros });
    setName("");
    setCal("");
    setPro("");
    setCarb("");
    setFat("");
    setPortions(1);
    setInspirationImage(null);
    setRecipeUrl("");
    setRecipeImageUrl(null);
    setRecipeServings(null);
    setShowAdd(false);
  };

  const handleMenuScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMenuScanLoading(true);
    setMenuItems([]);
    try {
      const { prepareImageForUpload } = await import("@/lib/image-utils");
      const blob = await prepareImageForUpload(file);
      const fd = new FormData();
      fd.append("image", blob, "menu.jpg");
      const res = await fetch("/api/meals/analyze-menu", { method: "POST", body: fd });
      const data = await res.json();
      if (data.items?.length) {
        setMenuItems(data.items);
        setShowAdd(true);
        showToast?.(`Found ${data.items.length} menu items`);
      }
    } catch {
      showToast?.("Menu scan failed");
    }
    setMenuScanLoading(false);
    e.target.value = "";
  };

  const applyMenuItem = (item: { name: string; estimatedMacros: { calories: number; protein: number; carbs: number; fat: number } }) => {
    setName(item.name);
    setCal(String(item.estimatedMacros.calories ?? ""));
    setPro(String(item.estimatedMacros.protein ?? ""));
    setCarb(String(item.estimatedMacros.carbs ?? ""));
    setFat(String(item.estimatedMacros.fat ?? ""));
    setPortions(1);
    setMenuItems([]);
  };

  const saveRestaurantMeal = (item: { name: string; estimatedMacros: { calories: number; protein: number; carbs: number; fat: number } }, restaurantName = "Menu") => {
    const existing = getSavedRestaurantMeals();
    if (existing.some((m) => m.itemName === item.name && m.restaurantName === restaurantName)) {
      showToast?.("Already saved");
      return;
    }
    const entry = {
      id: uuidv4(),
      restaurantName,
      itemName: item.name,
      macros: item.estimatedMacros,
      savedAt: new Date().toISOString(),
    };
    const next = [entry, ...existing];
    saveSavedRestaurantMeals(next);
    setSavedRestaurantMeals(next);
    syncToServer();
    showToast?.("Saved for later");
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {activeFast && (
        <div className="rounded-xl border border-[var(--accent-warm)]/40 bg-[var(--accent-warm)]/5 px-4 py-2.5 flex items-center gap-2">
          <span className="text-[var(--accent-warm)] font-medium">Fasting</span>
          <span className="text-xs text-[var(--muted)]">Log meals when you break your fast</span>
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="section-title !text-xl">Meal tracking</h2>
          <p className="section-subtitle">Log meals, scan photos, and track your daily macros</p>
        </div>
        <button
          onClick={() => setCalendarOpen((v) => !v)}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${calendarOpen
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

      {/* Pantry & Meal prep */}
      <div className="grid gap-4 sm:grid-cols-2">
        <PantrySection />
        <MealPrepSection
          targets={targets}
          onAddMeals={(meals) => {
            for (const m of meals) {
              const entry: MealEntry = {
                id: uuidv4(),
                date: isViewingToday ? today : selectedDate,
                mealType: (m.mealType || "lunch") as MealEntry["mealType"],
                name: m.name,
                macros: m.macros,
                loggedAt: new Date().toISOString(),
              };
              onAddMeal(entry);
              embedMealBackground(entry);
            }
          }}
        />
      </div>

      {/* Generate meal plan for empty upcoming days */}
      {emptyUpcomingDates.length > 0 && (
        <div className="card p-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[var(--muted)]">
            {emptyUpcomingDates.length} upcoming day{emptyUpcomingDates.length !== 1 ? "s" : ""} with no meals logged
          </p>
          <button
            onClick={async () => {
              setGeneratePlanLoading(true);
              try {
                const res = await fetch("/api/meals/generate-plan", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    dates: emptyUpcomingDates,
                    targets,
                    goal,
                  }),
                });
                const data = await res.json();
                if (data.error) throw new Error(data.error);
                const plan = data.plan as Record<string, { mealType: string; name: string; calories: number; protein: number; carbs: number; fat: number; url?: string }[]>;
                let added = 0;
                for (const date of Object.keys(plan)) {
                  for (const m of plan[date] ?? []) {
                    const meal: MealEntry = {
                      id: uuidv4(),
                      date,
                      mealType: m.mealType as MealEntry["mealType"],
                      name: m.name,
                      macros: { calories: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat },
                      loggedAt: new Date().toISOString(),
                    };
                    onAddMeal(meal);
                    embedMealBackground(meal);
                    added++;
                  }
                }
                showToast?.(`Added ${added} meals across ${Object.keys(plan).length} days`);
              } catch (err) {
                showToast?.(err instanceof Error ? err.message : "Could not generate meal plan");
              } finally {
                setGeneratePlanLoading(false);
              }
            }}
            disabled={generatePlanLoading}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            {generatePlanLoading ? (
              <span className="animate-spin">⟳</span>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
            )}
            Generate meal plan
          </button>
        </div>
      )}

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
          <div className="flex flex-wrap gap-2 items-center">
            <button onClick={() => setShowAdd(true)} className="btn-primary">+ Log a meal</button>
            <button onClick={handleVoiceLog} disabled={voiceLoading} className="btn-secondary !text-xs disabled:opacity-50" title="Describe your meal by voice">
              {voiceLoading ? "Listening…" : "Voice log"}
            </button>
            <label className="btn-secondary !text-xs cursor-pointer" title="Photo of your plate — JPEG/PNG, large photos auto-resize for best results">
              <input type="file" accept="image/*" className="hidden" onChange={handlePhotoLog} disabled={photoLoading} />
              {photoLoading ? "Analyzing…" : "Snap plate"}
            </label>
            <label className="btn-secondary !text-xs cursor-pointer" title="Photo of receipt — JPEG/PNG, large photos auto-resize">
              <input type="file" accept="image/*" className="hidden" onChange={handleReceiptScan} disabled={receiptLoading} />
              {receiptLoading ? "Scanning…" : "Scan receipt"}
            </label>
            <label className="btn-secondary !text-xs cursor-pointer" title="Photo of restaurant menu — extract items with macros">
              <input type="file" accept="image/*" className="hidden" onChange={handleMenuScan} disabled={menuScanLoading} />
              {menuScanLoading ? "Scanning…" : "Scan menu"}
            </label>
          </div>
        </div>
      ) : (
        <div className="card p-4 sm:p-5 animate-slide-up max-w-2xl">
          <h3 className="section-title !text-base mb-1">Add meal</h3>
          <p className="text-sm text-[var(--muted)] mb-3">Enter a name, or use the buttons below to fill in quickly.</p>
          {getRecentMealTemplates().length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-medium text-[var(--muted)] mb-2">Recent meals &amp; recipes</p>
              <div className="flex flex-wrap gap-2">
                {getRecentMealTemplates().slice(0, 12).map((t) => (
                  <button
                    key={`${t.name}-${t.lastUsed}`}
                    type="button"
                    onClick={() => {
                      setName(t.name);
                      setCal(String(t.macros.calories ?? ""));
                      setPro(String(t.macros.protein ?? ""));
                      setCarb(String(t.macros.carbs ?? ""));
                      setFat(String(t.macros.fat ?? ""));
                      setPortions(1);
                    }}
                    className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-elevated)] px-3 py-2 text-xs text-[var(--foreground)] hover:bg-[var(--surface)] hover:border-[var(--accent)]/40 transition-colors"
                  >
                    {t.name} <span className="text-[var(--muted)]">· {t.macros.calories ?? 0} cal</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {menuItems.length > 0 && (
            <div className="mb-3 space-y-2">
              <p className="text-xs font-medium text-[var(--muted)]">Menu items — click to use, 📌 to save</p>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {menuItems.map((item, i) => (
                  <div key={i} className="inline-flex items-center gap-0.5 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-elevated)] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => applyMenuItem(item)}
                      className="px-2.5 py-1.5 text-xs text-[var(--foreground)] hover:border-[var(--accent)]/40"
                    >
                      {item.name} · {item.estimatedMacros?.calories ?? "?"} cal
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); saveRestaurantMeal(item); }}
                      className="px-1.5 py-1.5 text-[10px] text-[var(--muted)] hover:text-[var(--accent)] border-l border-[var(--border-soft)]"
                      title="Save for later"
                    >
                      📌
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {savedRestaurantMeals.length > 0 && (
            <div className="mb-3 space-y-2">
              <p className="text-xs font-medium text-[var(--muted)]">Saved meals</p>
              <div className="flex flex-wrap gap-1.5">
                {savedRestaurantMeals.slice(0, 8).map((m) => (
                  <span
                    key={m.id}
                    className="inline-flex items-center gap-0.5 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/5 overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => applyMenuItem({ name: m.itemName, estimatedMacros: m.macros })}
                      className="px-2.5 py-1.5 text-xs text-[var(--foreground)] hover:border-[var(--accent)]/50"
                    >
                      {m.itemName} · {m.macros.calories} cal
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const next = savedRestaurantMeals.filter((x) => x.id !== m.id);
                        setSavedRestaurantMeals(next);
                        saveSavedRestaurantMeals(next);
                        syncToServer();
                      }}
                      className="px-1.5 py-1.5 text-[10px] text-[var(--muted)] hover:text-[var(--accent-terracotta)]"
                      title="Remove"
                    >
                      ×
                    </button>
                  </span>
                ))}
                {savedRestaurantMeals.length > 8 && <span className="text-[10px] text-[var(--muted)]">+{savedRestaurantMeals.length - 8}</span>}
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={handleSuggest}
            disabled={suggestLoading}
            title="Get AI meal ideas — uses pantry when you have 3+ items"
            className="mb-3 rounded-lg border border-[var(--accent)] px-3 py-1.5 text-sm text-[var(--accent)] bg-[var(--accent-10)] hover:bg-[var(--accent-20)] disabled:opacity-50"
          >
            {suggestLoading ? "Finding recipes…" : "✨ AI suggest meal"}
          </button>
          {suggestions.length > 0 && (
            <div className="mb-3 space-y-2">
              <p className="text-xs font-medium text-[var(--muted)]">Click to use · links open recipe</p>
              <div className="flex flex-col gap-2">
                {suggestions.map((s, i) => (
                  <div
                    key={`${s.name}-${i}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-elevated)] p-2.5 hover:border-[var(--accent)]/40 transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => applySuggestion(s)}
                      className="flex-1 text-left text-sm font-medium text-[var(--foreground)] hover:text-[var(--accent)]"
                    >
                      {s.name}
                      <span className="ml-2 text-[10px] font-normal text-[var(--muted)]">
                        {s.calories ?? "?"} cal{s.protein != null ? ` · ${s.protein}g pro` : ""}
                      </span>
                    </button>
                    {s.url && (
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0 rounded px-2 py-1 text-[10px] font-medium text-[var(--accent)] hover:bg-[var(--accent-10)]"
                      >
                        View recipe →
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="mb-3 flex flex-wrap gap-2">
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={handleNutritionLookup}
                disabled={nutritionLookupLoading || !name.trim()}
                className="rounded-lg border border-[var(--accent-sage)] bg-[var(--accent-sage)]/10 px-4 py-2 text-sm text-[var(--accent-sage)] disabled:opacity-50"
              >
                {nutritionLookupLoading ? "Looking up nutrition..." : "Auto-fill nutrition"}
              </button>
              {nutritionLookupLoading && (
                <span className="text-[10px] text-[var(--muted)] animate-pulse">
                  {nutritionLookupStatus ?? "Looking up nutrition..."}
                </span>
              )}
              {nutritionSource && (
                <span className="text-[10px] text-[var(--muted)]">
                  {nutritionSource === "usda" && "Source: USDA FoodData Central"}
                  {nutritionSource === "openfoodfacts" && "Source: Open Food Facts"}
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
          <div className="flex flex-col gap-2">
            <label className="label !mb-0">Import from recipe URL</label>
            <div className="flex gap-2">
              <input
                type="url"
                placeholder="https://example.com/recipe/chicken-stir-fry"
                value={recipeUrl}
                onChange={(e) => setRecipeUrl(e.target.value)}
                className="input-base rounded-lg px-4 py-2 text-sm flex-1"
              />
              <button
                type="button"
                onClick={handleRecipeUrlImport}
                disabled={recipeUrlLoading || !recipeUrl.trim()}
                className="rounded-lg border border-[var(--accent)] bg-[var(--accent)]/10 px-4 py-2 text-sm text-[var(--accent)] disabled:opacity-50"
              >
                {recipeUrlLoading ? "Fetching…" : "Import"}
              </button>
            </div>
            {recipeServings && recipeServings > 1 && (
              <p className="text-xs text-[var(--muted)]">Serves {recipeServings} — nutrition is per serving</p>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className="label !mb-0">Meal name</label>
              <input
                placeholder="e.g. Grilled chicken salad"
                value={name}
                onChange={(e) => {
                  const val = e.target.value;
                  setName(val);
                  const match = getRecentMealTemplates().find((t) => t.name.toLowerCase() === val.trim().toLowerCase());
                  if (match) {
                    setCal(String(match.macros.calories ?? ""));
                    setPro(String(match.macros.protein ?? ""));
                    setCarb(String(match.macros.carbs ?? ""));
                    setFat(String(match.macros.fat ?? ""));
                    setPortions(1);
                  }
                }}
                list="recent-meals-list"
                className="input-base rounded-lg px-4 py-2 text-[var(--foreground)]"
              />
              <datalist id="recent-meals-list">
                {getRecentMealTemplates().map((t) => (
                  <option key={`${t.name}-${t.lastUsed}`} value={t.name} />
                ))}
              </datalist>
              {(similarMeals.length > 0 || (name.trim().length >= 2 && getMealEmbeddings().length === 0 && !similarLoading)) && (
                <p className="text-[10px] text-[var(--muted)] mt-1">
                  {similarMeals.length > 0 ? (
                    <>
                      Similar to past meals:{" "}
                      {similarMeals.map((s) => {
                        const m = meals.find((x) => x.id === s.mealId);
                        return (
                          <button
                            key={s.mealId}
                            type="button"
                            onClick={() => {
                              setName(s.name);
                              if (m?.macros) {
                                setCal(String(m.macros.calories ?? ""));
                                setPro(String(m.macros.protein ?? ""));
                                setCarb(String(m.macros.carbs ?? ""));
                                setFat(String(m.macros.fat ?? ""));
                                setPortions(1);
                              }
                            }}
                            className="text-[var(--accent)] hover:underline mr-1"
                          >
                            {s.name}
                          </button>
                        );
                      })}
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
            <div className="flex flex-col gap-1">
              <label className="label !mb-0">Portions</label>
              <input
                type="number"
                min={0.25}
                step={0.25}
                placeholder="1"
                value={portions === 1 ? "" : portions}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "") {
                    handlePortionsChange(1);
                    return;
                  }
                  const n = parseFloat(v);
                  if (!Number.isNaN(n)) handlePortionsChange(n);
                }}
                onBlur={(e) => {
                  if (e.target.value === "") handlePortionsChange(1);
                }}
                className="input-base rounded-lg px-4 py-2 text-[var(--foreground)]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="label !mb-0">Calories</label>
              <input type="number" placeholder="e.g. 450" value={cal} onChange={(e) => setCal(e.target.value)} className="input-base rounded-lg px-4 py-2 text-[var(--foreground)]" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="label !mb-0">Protein (g)</label>
              <input type="number" placeholder="e.g. 35" value={pro} onChange={(e) => setPro(e.target.value)} className="input-base rounded-lg px-4 py-2 text-[var(--foreground)]" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="label !mb-0">Carbs (g)</label>
              <input type="number" placeholder="e.g. 40" value={carb} onChange={(e) => setCarb(e.target.value)} className="input-base rounded-lg px-4 py-2 text-[var(--foreground)]" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="label !mb-0">Fat (g)</label>
              <input type="number" placeholder="e.g. 15" value={fat} onChange={(e) => setFat(e.target.value)} className="input-base rounded-lg px-4 py-2 text-[var(--foreground)]" />
            </div>
          </div>
          {(inspirationImage || recipeImageUrl) && (
            <div className="mt-3">
              <img
                src={recipeImageUrl ?? `data:image/png;base64,${inspirationImage}`}
                alt="Meal"
                className="max-h-36 rounded-lg object-cover"
              />
              {inspirationImage && !recipeImageUrl && (
                <p className="text-[10px] text-[var(--muted)] mt-1 italic">AI-generated image via Nova Canvas — for inspiration only</p>
              )}
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <button onClick={handleAdd} className="btn-primary rounded-lg px-4 py-2">
              Save
            </button>
            <button onClick={() => { setShowAdd(false); setPortions(1); setRecipeUrl(""); setRecipeImageUrl(null); setRecipeServings(null); }} className="rounded-lg border border-[var(--border)] px-4 py-2 text-[var(--muted)] hover:bg-[var(--surface-elevated)]">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ─── Cooking App Integration ─── */}
      <CookingAppSync
        meals={meals}
        onAddMeal={onAddMeal}
        onEmbedMeal={embedMealBackground}
      />

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

      <MealList
        dateLabel={dateLabel}
        isViewingToday={isViewingToday}
        displayMeals={displayMeals}
        mealsByCategory={mealsByCategory}
        onEditMeal={onEditMeal}
        onDeleteMeal={onDeleteMeal}
        onShowAdd={() => setShowAdd(true)}
        onVoiceLog={handleVoiceLog}
        onPhotoLog={handlePhotoLog}
        voiceLoading={voiceLoading}
        photoLoading={photoLoading}
      />
    </div>
  );
}
