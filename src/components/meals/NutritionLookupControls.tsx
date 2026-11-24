"use client";

/** Auto-fill nutrition + meal visual generation controls inside the add-meal form. */
export function NutritionLookupControls({
  name,
  nutritionLookupLoading,
  nutritionLookupStatus,
  nutritionSource,
  inspirationLoading,
  onNutritionLookup,
  onGenerateInspiration,
}: {
  name: string;
  nutritionLookupLoading: boolean;
  nutritionLookupStatus: string | null;
  nutritionSource: "usda" | "web" | "estimated" | "openfoodfacts" | null;
  inspirationLoading: boolean;
  onNutritionLookup: () => void;
  onGenerateInspiration: () => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={onNutritionLookup}
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
        onClick={onGenerateInspiration}
        disabled={inspirationLoading}
        className="rounded-lg border border-[var(--accent-warm)] bg-[var(--accent-warm-10)] px-4 py-2 text-sm text-[var(--accent-warm)] disabled:opacity-50"
      >
        {inspirationLoading ? "Generating visual..." : "Generate meal visual"}
      </button>
    </div>
  );
}
