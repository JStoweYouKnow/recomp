"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CookingAppRecipe, MealEntry, Macros } from "@/lib/types";
import type { RecentMealTemplate } from "@/lib/storage";
import { getActivityLog, getPantry, getProfile } from "@/lib/storage";
import {
  recommendFromMemory,
  type MealRecommendation,
} from "@/lib/meal-recommendations";
import {
  buildDiscoveryParams,
  buildUserRecipeContext,
  inferMealTypeForNow,
} from "@/lib/user-recipe-context";
import { remainingMacros } from "@/lib/recipe-fit";

type Tab = "meals" | "snacks" | "discover";

function sourceLabel(source: MealRecommendation["source"]): string {
  switch (source) {
    case "saved_recipe":
      return "Recipe";
    case "discovered":
      return "Discover";
    case "template":
      return "Recent";
    case "sponsored":
      return "Sponsored";
    default:
      return "Your log";
  }
}

function RecommendationChip({
  item,
  onSelect,
}: {
  item: MealRecommendation;
  onSelect: (item: MealRecommendation) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className="text-left rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 hover:border-[var(--accent)]/50 transition-colors min-w-[140px] max-w-[200px] flex-shrink-0"
    >
      <div className="flex items-start justify-between gap-1 mb-1">
        <span className="text-sm font-medium leading-tight line-clamp-2">{item.name}</span>
        <span className="text-[10px] text-[var(--muted)] whitespace-nowrap">{item.fitScore}%</span>
      </div>
      <p className="text-[11px] text-[var(--muted)] tabular-nums">
        {item.macros.calories} cal · P {Math.round(item.macros.protein)}g
      </p>
      <p className="text-[10px] text-[var(--muted)] mt-0.5 line-clamp-2">{item.fitReason}</p>
      <span className="inline-block mt-1.5 text-[9px] uppercase tracking-wide text-[var(--accent)] opacity-80">
        {sourceLabel(item.source)}
      </span>
    </button>
  );
}

export function MemoryRecommendations({
  meals,
  templates,
  savedRecipes,
  targets,
  consumed,
  goal,
  onSelect,
}: {
  meals: MealEntry[];
  templates: RecentMealTemplate[];
  savedRecipes?: CookingAppRecipe[];
  targets: Macros;
  consumed: Macros;
  goal?: string;
  onSelect: (item: MealRecommendation) => void;
}) {
  const [tab, setTab] = useState<Tab>("meals");
  const [discoverItems, setDiscoverItems] = useState<MealRecommendation[]>([]);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [activitySummary, setActivitySummary] = useState<string | null>(null);
  const [discoveryQuery, setDiscoveryQuery] = useState<string | null>(null);

  const budget = useMemo(() => remainingMacros(targets, consumed), [targets, consumed]);

  const { meals: mealRecs, snacks: snackRecs } = useMemo(
    () =>
      recommendFromMemory({
        meals,
        templates,
        savedRecipes,
        targets,
        consumed,
        goal,
        includeRecipes: (savedRecipes?.length ?? 0) > 0,
      }),
    [meals, templates, savedRecipes, targets, consumed, goal],
  );

  const loadDiscover = useCallback(async () => {
    setDiscoverLoading(true);
    setDiscoverError(null);
    try {
      const profile = getProfile();
      const pantry = getPantry();
      const activityLog = getActivityLog();
      const ctx = buildUserRecipeContext({
        meals,
        pantry,
        activityLog,
        savedRecipes: savedRecipes ?? [],
        profile: profile ? { goal: profile.goal, dietaryRestrictions: profile.dietaryRestrictions } : null,
        date: new Date().toISOString().slice(0, 10),
        remainingCalories: budget.calories,
        remainingProtein: budget.protein,
        goal: goal ?? profile?.goal,
      });
      const params = buildDiscoveryParams(ctx);
      setActivitySummary(ctx.activitySummary);
      setDiscoveryQuery(params.query);

      const res = await fetch("/api/recipes/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          macroTargets: targets,
          todayMacros: consumed,
          goal: goal ?? profile?.goal,
          mealType: params.mealType,
          recipes: savedRecipes ?? [],
          meals,
          pantry,
          activityLog,
          profile: profile
            ? { goal: profile.goal, dietaryRestrictions: profile.dietaryRestrictions }
            : undefined,
          includeDiscover: true,
          autoQueryFromActivity: true,
          limit: 6,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load recipes");

      if (data.activitySummary) setActivitySummary(data.activitySummary);
      if (data.discoveryQuery) setDiscoveryQuery(data.discoveryQuery);

      const mapped = (data.suggestions ?? []).map(
        (s: {
          id: string;
          name: string;
          calories: number;
          protein: number;
          carbs: number;
          fat: number;
          recipeUrl?: string;
          source?: string;
          fitScore: number;
          fitReason: string;
        }) => ({
          id: s.id,
          name: s.name,
          macros: {
            calories: s.calories,
            protein: s.protein,
            carbs: s.carbs,
            fat: s.fat,
          },
          source:
            s.source === "edamam" || s.source === "curated"
              ? ("discovered" as const)
              : ("saved_recipe" as const),
          category: s.calories <= 280 ? ("snack" as const) : ("meal" as const),
          fitScore: s.fitScore,
          fitReason: s.fitReason,
          mealType: params.mealType,
          recipeUrl: s.recipeUrl,
        }),
      );
      setDiscoverItems(mapped);
    } catch (e) {
      setDiscoverError(e instanceof Error ? e.message : "Could not load recipes");
      setDiscoverItems([]);
    } finally {
      setDiscoverLoading(false);
    }
  }, [meals, savedRecipes, targets, consumed, goal, budget.calories, budget.protein]);

  useEffect(() => {
    if (tab === "discover" && discoverItems.length === 0 && !discoverLoading) {
      void loadDiscover();
    }
  }, [tab, discoverItems.length, discoverLoading, loadDiscover]);

  const items =
    tab === "meals" ? mealRecs : tab === "snacks" ? snackRecs : discoverItems;

  const hasMemory = mealRecs.length > 0 || snackRecs.length > 0;
  if (!hasMemory && tab !== "discover") {
    return (
      <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--card)]/50 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Recommended for you</h3>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              Log a few meals to unlock history picks — or browse Discover
            </p>
          </div>
          <button
            type="button"
            onClick={() => setTab("discover")}
            className="text-xs px-2.5 py-1 rounded-lg bg-[var(--accent)] text-white shrink-0"
          >
            Discover
          </button>
        </div>
      </div>
    );
  }

  const remainingCal = Math.round(budget.calories);
  const subtitle =
    tab === "discover"
      ? activitySummary
        ? `Discover · ${activitySummary}`
        : discoveryQuery
          ? `Searching: ${discoveryQuery}`
          : "Recipes matched to your activity"
      : `From your history · ${remainingCal} cal left today`;

  return (
    <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--card)]/50 p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">Recommended for you</h3>
          <p className="text-xs text-[var(--muted)] mt-0.5 truncate">{subtitle}</p>
        </div>
        <div className="flex rounded-lg border border-[var(--border)] overflow-hidden text-xs shrink-0">
          <button
            type="button"
            onClick={() => setTab("meals")}
            className={`px-2 py-1 ${tab === "meals" ? "bg-[var(--accent)] text-white" : "text-[var(--muted)]"}`}
          >
            Meals{mealRecs.length > 0 ? ` (${mealRecs.length})` : ""}
          </button>
          <button
            type="button"
            onClick={() => setTab("snacks")}
            className={`px-2 py-1 ${tab === "snacks" ? "bg-[var(--accent)] text-white" : "text-[var(--muted)]"}`}
          >
            Snacks{snackRecs.length > 0 ? ` (${snackRecs.length})` : ""}
          </button>
          <button
            type="button"
            onClick={() => setTab("discover")}
            className={`px-2 py-1 ${tab === "discover" ? "bg-[var(--accent)] text-white" : "text-[var(--muted)]"}`}
          >
            Discover
          </button>
        </div>
      </div>

      {tab === "discover" && discoverLoading && (
        <p className="text-xs text-[var(--muted)] py-2">Finding recipes for {inferMealTypeForNow()}…</p>
      )}

      {discoverError && tab === "discover" && (
        <p className="text-xs text-[var(--error)] mb-2">{discoverError}</p>
      )}

      {items.length === 0 && !discoverLoading ? (
        <p className="text-xs text-[var(--muted)]">
          {tab === "snacks"
            ? "No snack matches in your history yet — log a few snacks to get picks here."
            : tab === "discover"
              ? "No external matches right now. Log meals or add pantry items to personalize discovery."
              : "No meal matches right now. Try Discover or log more meals."}
        </p>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
          {items.map((item) => (
            <RecommendationChip key={item.id} item={item} onSelect={onSelect} />
          ))}
        </div>
      )}

      {tab === "discover" && !discoverLoading && (
        <button
          type="button"
          onClick={() => void loadDiscover()}
          className="text-[10px] text-[var(--accent)] mt-2 hover:underline"
        >
          Refresh discovery
        </button>
      )}

      <p className="text-[10px] text-[var(--muted)] mt-2">
        Tap to pre-fill · Discover uses your logs, pantry, and workouts
      </p>
    </div>
  );
}

export { inferMealTypeForNow };
