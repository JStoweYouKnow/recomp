"use client";

import { useState, useEffect, useCallback } from "react";
import { buildShoppingListFromPlan } from "@/lib/shopping-list";
import type { FitnessPlan } from "@/lib/types";

interface GroceryResult {
  searchTerm: string;
  found?: boolean;
  product?: { name?: string; price?: string; available?: boolean };
  addedToCart?: boolean;
  addToCartError?: string;
  source?: string;
}

const STORE_OPTIONS: { value: "fresh" | "wholefoods" | "amazon"; label: string }[] = [
  { value: "fresh", label: "Amazon Fresh" },
  { value: "wholefoods", label: "Whole Foods" },
  { value: "amazon", label: "Amazon.com" },
];

const BATCH_SIZE_SEARCH = 3;
const BATCH_SIZE_ADD_TO_CART = 2;

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

export function ShoppingList({ plan }: { plan: FitnessPlan | null }) {
  const [items, setItems] = useState<string[]>([]);
  const [newItem, setNewItem] = useState("");
  const [store, setStore] = useState<"fresh" | "wholefoods" | "amazon">("fresh");
  const [addToCart, setAddToCart] = useState(false);
  const [sending, setSending] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [results, setResults] = useState<GroceryResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

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
    const batchSize = addToCart ? BATCH_SIZE_ADD_TO_CART : BATCH_SIZE_SEARCH;
    const batches: string[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    setSending(true);
    setError(null);
    setNote(null);
    setResults([]);
    const allResults: GroceryResult[] = [];
    try {
      for (let i = 0; i < batches.length; i++) {
        setBatchProgress({ current: i + 1, total: batches.length });
        const res = await fetch("/api/act/grocery", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: batches[i], store, addToCart }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Request failed");
          break;
        }
        if (data.note) setNote(data.note);
        const batchResults = Array.isArray(data.results) ? data.results : [];
        allResults.push(...batchResults);
        setResults([...allResults]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send to Amazon");
    } finally {
      setSending(false);
      setBatchProgress(null);
    }
  };

  return (
    <div className="card p-6">
      <h3 className="section-title !text-base mb-1">Shopping list</h3>
      <p className="section-subtitle mb-4">
        Build a full list, choose your store, then send to Amazon. Optionally add items to your cart (requires Nova Act and a logged-in Amazon profile).
      </p>

      {/* Store & options */}
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
        <label className="flex items-center gap-1.5 text-sm cursor-pointer" title="Requires Nova Act with a logged-in Amazon profile">
          <input
            type="checkbox"
            checked={addToCart}
            onChange={(e) => setAddToCart(e.target.checked)}
            className="rounded border-[var(--border)]"
            disabled={sending}
          />
          Add to cart
        </label>
      </div>
      {addToCart && (
        <p className="text-xs text-[var(--muted)] mb-2">Uses your saved Amazon session (run setup_amazon_login.py once).</p>
      )}

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

      {/* List */}
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
                  ×
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

      {/* Send to Amazon */}
      <div className="mb-4">
        <button
          type="button"
          onClick={handleSendToAmazon}
          disabled={sending || items.length === 0}
          className="btn-primary text-sm"
        >
          {sending && batchProgress
            ? `Sending to ${STORE_OPTIONS.find((o) => o.value === store)?.label ?? store}… (batch ${batchProgress.current}/${batchProgress.total})`
            : `Send to ${STORE_OPTIONS.find((o) => o.value === store)?.label ?? store}`}
        </button>
      </div>

      {error && <p className="text-sm text-[var(--accent-terracotta)] mb-2" role="alert">{error}</p>}
      {note && !error && <p className="text-sm text-[var(--muted)] mb-2">{note}</p>}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t border-[var(--border-soft)]">
          <p className="text-xs font-medium text-[var(--muted)]">Results</p>
          {results.map((r, i) => (
            <div
              key={`${i}-${r.searchTerm}`}
              className="flex items-center justify-between text-sm rounded-lg bg-[var(--surface-elevated)] px-3 py-2"
            >
              <span className="truncate">{r.searchTerm}</span>
              <span className="shrink-0 text-[var(--muted)] text-xs ml-2">
                {r.found ? (r.product?.price ?? "Found") : "Not found"}
                {r.addedToCart && " · In cart"}
                {r.addToCartError && ` · ${r.addToCartError}`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
