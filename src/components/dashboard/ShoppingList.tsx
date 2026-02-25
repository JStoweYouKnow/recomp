"use client";

import { useState, useEffect, useCallback } from "react";
import { buildShoppingListFromPlan } from "@/lib/shopping-list";
import { callActDirect, isActServiceConfigured } from "@/lib/act-client";
import type { FitnessPlan } from "@/lib/types";

interface GroceryResult {
  searchTerm: string;
  found?: boolean;
  product?: { name?: string; price?: string; available?: boolean };
  asin?: string;
  addToCartUrl?: string;
  productUrl?: string;
  source?: string;
  error?: string;
}

interface GroceryResponse {
  results?: GroceryResult[];
  batchCartUrl?: string;
  note?: string;
  error?: string;
}

const STORE_OPTIONS: { value: "fresh" | "wholefoods" | "amazon"; label: string }[] = [
  { value: "fresh", label: "Amazon Fresh" },
  { value: "wholefoods", label: "Whole Foods" },
  { value: "amazon", label: "Amazon.com" },
];

const BATCH_SIZE = 5;

function getShoppingList(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("recomp_shopping_list");
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function saveShoppingList(items: string[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("recomp_shopping_list", JSON.stringify(items));
}

/** Build a batch Amazon cart URL from multiple ASINs. */
function buildBatchCartUrl(asins: string[]): string {
  const params = new URLSearchParams();
  asins.forEach((asin, i) => {
    params.set(`ASIN.${i + 1}`, asin);
    params.set(`Quantity.${i + 1}`, "1");
  });
  return `https://www.amazon.com/gp/aws/cart/add.html?${params.toString()}`;
}

export function ShoppingList({ plan }: { plan: FitnessPlan | null }) {
  const [items, setItems] = useState<string[]>([]);
  const [newItem, setNewItem] = useState("");
  const [store, setStore] = useState<"fresh" | "wholefoods" | "amazon">("fresh");
  const [sending, setSending] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [results, setResults] = useState<GroceryResult[]>([]);
  const [batchCartUrl, setBatchCartUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setItems(getShoppingList());
  }, []);

  const persist = useCallback((next: string[]) => {
    setItems(next);
    saveShoppingList(next);
  }, []);

  const handleLoadFromPlan = () => {
    if (!plan) return;
    const fromPlan = buildShoppingListFromPlan(plan);
    if (fromPlan.length === 0) return;
    persist(fromPlan);
  };

  const handleAddItem = () => {
    const trimmed = newItem.trim();
    if (!trimmed || items.includes(trimmed)) return;
    setNewItem("");
    persist([...items, trimmed]);
  };

  const handleRemove = (index: number) => {
    persist(items.filter((_, i) => i !== index));
  };

  const handleSendToAmazon = async () => {
    if (items.length === 0) {
      setError("Add items or load from your plan first.");
      return;
    }

    const batches: string[][] = [];
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      batches.push(items.slice(i, i + BATCH_SIZE));
    }

    setSending(true);
    setError(null);
    setResults([]);
    setBatchCartUrl(null);

    const allResults: GroceryResult[] = [];
    const allAsins: string[] = [];

    try {
      for (let i = 0; i < batches.length; i++) {
        setBatchProgress({ current: i + 1, total: batches.length });
        const payload = { items: batches[i], store };

        let data: GroceryResponse;
        try {
          if (isActServiceConfigured()) {
            data = await callActDirect<GroceryResponse>("/grocery", payload, { timeoutMs: 480_000 });
          } else {
            const res = await fetch("/api/act/grocery", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            data = await res.json();
            if (!res.ok && data.error) { setError(data.error); break; }
          }
        } catch {
          // Timeout or network error — show search fallback links for this batch
          const fallback = batches[i].map((item) => ({
            searchTerm: item,
            found: false,
            addToCartUrl: `https://www.amazon.com/s?k=${encodeURIComponent(item)}`,
            source: "fallback",
          }));
          allResults.push(...fallback);
          setResults([...allResults]);
          continue;
        }

        if (data.error && !data.results?.length) {
          setError(data.error);
          break;
        }

        const batchResults = Array.isArray(data.results) ? data.results : [];
        allResults.push(...batchResults);
        setResults([...allResults]);

        // Collect ASINs for the batch cart URL
        for (const r of batchResults) {
          if (r.asin) allAsins.push(r.asin);
        }
      }

      // Build a single URL that adds ALL found items to Amazon cart at once
      if (allAsins.length > 0) {
        setBatchCartUrl(buildBatchCartUrl(allAsins));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to search Amazon");
    } finally {
      setSending(false);
      setBatchProgress(null);
    }
  };

  const foundCount = results.filter((r) => r.asin).length;

  return (
    <div className="card p-6">
      <h3 className="section-title !text-base mb-1">Shopping list</h3>
      <p className="section-subtitle mb-4">
        Build a list from your diet plan, pick a store, then add everything to your Amazon cart in one click.
      </p>

      {/* Store picker */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="label text-xs" htmlFor="shopping-store">Store</label>
          <select
            id="shopping-store"
            value={store}
            onChange={(e) => setStore(e.target.value as typeof store)}
            className="input-base text-sm"
            disabled={sending}
          >
            {STORE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Load from plan */}
      {plan && (
        <div className="mb-4">
          <button
            type="button"
            onClick={handleLoadFromPlan}
            disabled={sending}
            className="text-sm text-[var(--accent)] hover:underline disabled:opacity-50"
          >
            Load from my meal plan
          </button>
        </div>
      )}

      {/* Item list */}
      <div className="space-y-2 mb-4">
        {items.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No items yet. Add below or load from your meal plan.</p>
        ) : (
          <ul className="space-y-1.5 max-h-48 overflow-y-auto">
            {items.map((item, i) => (
              <li key={`${i}-${item}`} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--surface-elevated)] px-3 py-2 text-sm">
                <span className="truncate">{item}</span>
                <button
                  type="button"
                  onClick={() => handleRemove(i)}
                  disabled={sending}
                  className="shrink-0 text-[var(--muted)] hover:text-[var(--accent-terracotta)] disabled:opacity-50"
                  aria-label={`Remove ${item}`}
                >
                  &times;
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddItem())}
            placeholder="Add an item..."
            className="input-base flex-1 text-sm"
            disabled={sending}
          />
          <button
            type="button"
            onClick={handleAddItem}
            disabled={sending || !newItem.trim()}
            className="btn-secondary !py-2 text-sm"
          >
            Add
          </button>
        </div>
      </div>

      {/* Search Amazon */}
      <div className="mb-4">
        <button
          type="button"
          onClick={handleSendToAmazon}
          disabled={sending || items.length === 0}
          className="btn-primary text-sm"
        >
          {sending && batchProgress
            ? `Searching ${STORE_OPTIONS.find((o) => o.value === store)?.label ?? store}… (batch ${batchProgress.current}/${batchProgress.total})`
            : `Search ${STORE_OPTIONS.find((o) => o.value === store)?.label ?? store}`}
        </button>
      </div>

      {error && <p className="text-sm text-[var(--accent-terracotta)] mb-2" role="alert">{error}</p>}

      {/* Batch Add to Cart — the main CTA after search completes */}
      {batchCartUrl && (
        <div className="mb-4 p-4 rounded-lg bg-[var(--surface-elevated)] border border-[var(--accent)]/30">
          <a
            href={batchCartUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary text-sm inline-block text-center w-full"
          >
            Add all {foundCount} items to Amazon cart
          </a>
          <p className="text-xs text-[var(--muted)] mt-2 text-center">
            Opens Amazon in a new tab — items are added to your cart automatically (you must be logged in).
          </p>
        </div>
      )}

      {/* Individual results */}
      {results.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t border-[var(--border-soft)]">
          <p className="text-xs font-medium text-[var(--muted)]">
            Found {foundCount} of {results.length} items
          </p>
          {results.map((r, i) => (
            <div
              key={`${i}-${r.searchTerm}`}
              className="flex items-center justify-between gap-2 text-sm rounded-lg bg-[var(--surface-elevated)] px-3 py-2"
            >
              <span className="truncate">{r.searchTerm}</span>
              <span className="shrink-0 flex items-center gap-2 text-[var(--muted)] text-xs">
                {r.asin ? (
                  <>
                    {r.product?.price ?? "Found"}
                    {r.addToCartUrl && (
                      <a
                        href={r.addToCartUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--accent)] hover:underline"
                        title="Add this item to your Amazon cart"
                      >
                        Add to cart
                      </a>
                    )}
                  </>
                ) : r.addToCartUrl ? (
                  <a
                    href={r.addToCartUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--accent)] hover:underline"
                  >
                    Search on Amazon
                  </a>
                ) : (
                  "Not found"
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
