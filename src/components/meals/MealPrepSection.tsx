"use client";

import { useState } from "react";
import type { MealPrepPlan, PantryItem } from "@/lib/types";
import { getMealPrepPlan, saveMealPrepPlan, getPantry } from "@/lib/storage";
import { syncToServer } from "@/lib/storage";
import { getTodayLocal } from "@/lib/date-utils";
import { getWeekStart } from "@/lib/date-utils";

export function MealPrepSection({
  targets,
  onAddMeals,
}: {
  targets: { calories: number; protein: number; carbs: number; fat: number };
  onAddMeals?: (meals: { name: string; macros: { calories: number; protein: number; carbs: number; fat: number }; mealType: string }[]) => void;
}) {
  const [plan, setPlan] = useState<MealPrepPlan | null>(() => getMealPrepPlan());
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [groceryLoading, setGroceryLoading] = useState(false);
  const [groceryList, setGroceryList] = useState<{ item: string; amount: string; category: string; checked: boolean }[]>([]);

  const weekStart = getWeekStart(getTodayLocal());

  const generate = async () => {
    setLoading(true);
    try {
      const pantry = getPantry();
      const res = await fetch("/api/meal-prep/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dailyTargets: targets,
          pantryItems: pantry.map((p) => p.name),
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const p: MealPrepPlan = {
        id: `prep-${Date.now()}`,
        weekStart,
        recipes: data.recipes ?? [],
        groceryList: [],
        batchInstructions: data.batchInstructions ?? [],
        estimatedPrepTime: data.estimatedPrepTime ?? 120,
        createdAt: new Date().toISOString(),
      };
      setPlan(p);
      saveMealPrepPlan(p);
      syncToServer();
      setGroceryList([]);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  const fetchGrocery = async () => {
    if (!plan?.recipes?.length) return;
    setGroceryLoading(true);
    try {
      const res = await fetch("/api/meal-prep/grocery-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipes: plan.recipes,
          pantryItems: getPantry().map((p) => ({ name: p.name })),
        }),
      });
      const data = await res.json();
      if (data.groceryList) setGroceryList(data.groceryList);
    } catch {
      setGroceryList([]);
    } finally {
      setGroceryLoading(false);
    }
  };

  return (
    <div className="card rounded-xl p-4">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-left"
      >
        <h4 className="font-semibold text-sm">Meal prep</h4>
        <span className="text-xs text-[var(--muted)]">{expanded ? "▼" : "▶"}</span>
      </button>
      {expanded && (
        <div className="mt-3 space-y-3 animate-fade-in">
          <p className="text-xs text-[var(--muted)]">Generate a batch-cookable weekly plan and grocery list.</p>
          <button type="button" onClick={generate} disabled={loading} className="btn-primary text-sm py-2 w-full disabled:opacity-50">
            {loading ? "Generating…" : "Generate meal prep plan"}
          </button>
          {plan && plan.recipes.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-[var(--muted)]">Recipes</p>
              {plan.recipes.slice(0, 4).map((r, i) => (
                <div key={i} className="rounded-lg bg-[var(--surface-elevated)] px-3 py-2 text-xs flex items-center justify-between gap-2">
                  <div>
                    <span className="font-medium">{r.name}</span>
                    <span className="text-[var(--muted)] ml-2">
                      {r.macrosPerServing.calories} cal · {r.servings} servings
                    </span>
                  </div>
                  {onAddMeals && (
                    <button
                      type="button"
                      onClick={() => onAddMeals([{ name: r.name, macros: r.macrosPerServing, mealType: "lunch" }])}
                      className="shrink-0 rounded px-2 py-0.5 text-label font-medium text-[var(--accent)] hover:bg-[var(--accent)]/10"
                    >
                      Add
                    </button>
                  )}
                </div>
              ))}
              {plan.recipes.length > 4 && <p className="text-label text-[var(--muted)]">+{plan.recipes.length - 4} more</p>}
              <button type="button" onClick={fetchGrocery} disabled={groceryLoading} className="btn-secondary text-xs py-1.5 w-full">
                {groceryLoading ? "Loading…" : "Get grocery list"}
              </button>
              {groceryList.length > 0 && (
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {groceryList.slice(0, 12).map((g, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span>{g.item}</span>
                      <span className="text-[var(--muted)]">{g.amount}</span>
                    </div>
                  ))}
                  {groceryList.length > 12 && <p className="text-label text-[var(--muted)]">+{groceryList.length - 12} more</p>}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
