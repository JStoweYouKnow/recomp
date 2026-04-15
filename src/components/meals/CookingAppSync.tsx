"use client";

import { useState } from "react";
import { getCookingAppRecipes, saveCookingAppRecipes } from "@/lib/storage";
import { useToast } from "@/components/Toast";
import type { MealEntry, CookingAppRecipe } from "@/lib/types";

type CookingTab = "off" | "connect" | "import" | "recipes" | "history";

export function CookingAppSync({
  meals,
  onAddMeal,
  onEmbedMeal,
}: {
  meals: MealEntry[];
  onAddMeal: (m: MealEntry) => void;
  onEmbedMeal: (m: MealEntry) => void;
}) {
  const { showToast } = useToast();
  const [cookingTab, setCookingTab] = useState<CookingTab>("off");
  const [recipeLibrary, setRecipeLibrary] = useState<CookingAppRecipe[]>(() => getCookingAppRecipes());
  const [cookingProvider, setCookingProvider] = useState("cronometer");
  const [cookingConnecting, setCookingConnecting] = useState(false);
  const [cookingConnections, setCookingConnections] = useState<{ provider: string; label: string; connectedAt: string; webhookSecret?: string }[]>(() => {
    try { return JSON.parse(localStorage.getItem("recomp_cooking_apps") ?? "[]"); } catch { return []; }
  });
  const [cookingImportLoading, setCookingImportLoading] = useState(false);
  const [cookingImportResult, setCookingImportResult] = useState<{ imported: number; meals: MealEntry[] } | null>(null);
  const [webhookVerifyLoading, setWebhookVerifyLoading] = useState(false);
  const [webhookVerifyResult, setWebhookVerifyResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null);

  return (
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
              className={`rounded-md px-3 py-1 text-xs font-medium transition ${cookingTab === t
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
        Apps that support webhooks (Whisk, Yummly, etc.) can push meals via Connect. Apps like Recipe Keeper and NYT Cooking don&apos;t support webhooks — use the <strong>Import</strong> tab to paste or upload recipe text and we&apos;ll parse it with AI.
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
                    cookingImportResult.meals.forEach((m) => {
                      onAddMeal(m);
                      onEmbedMeal(m);
                    });
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
  );
}
