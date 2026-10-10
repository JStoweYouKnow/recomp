import { scoreRecipeFit, type MacroBudget } from "./recipe-fit";

export interface MenuItemMacros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface MenuItemInput {
  name: string;
  description?: string | null;
  estimatedMacros: MenuItemMacros;
  confidence?: string;
  /** "official" when macros come from published restaurant nutrition, otherwise an estimate. */
  source?: string;
}

export interface RankedMenuItem extends MenuItemInput {
  fitScore: number;
  fitReason: string;
  /** "Macro approved" — one of the top picks that fits today's remaining budget. */
  recommended: boolean;
}

/** Minimum fit score for a menu item to earn the "macro approved" badge. */
export const MENU_APPROVED_MIN_SCORE = 60;

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

/** Coerce loosely-typed model output into menu items; drops entries without a name. */
export function normalizeMenuItems(raw: unknown): MenuItemInput[] {
  if (!Array.isArray(raw)) return [];
  const out: MenuItemInput[] = [];
  for (const el of raw) {
    if (!el || typeof el !== "object") continue;
    const o = el as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim() : "";
    if (!name) continue;
    const m = (o.estimatedMacros ?? o.macros ?? o) as Record<string, unknown>;
    out.push({
      name,
      description: typeof o.description === "string" ? o.description : null,
      estimatedMacros: {
        calories: toNum(m.calories),
        protein: toNum(m.protein),
        carbs: toNum(m.carbs),
        fat: toNum(m.fat),
      },
      confidence: typeof o.confidence === "string" ? o.confidence : undefined,
      source: typeof o.source === "string" ? o.source : undefined,
    });
  }
  return out;
}

/**
 * Score every menu item against the remaining macro budget, sort best-first,
 * and flag up to `maxRecommended` items as macro approved.
 */
export function rankMenuItems(
  items: MenuItemInput[],
  budget: MacroBudget,
  opts?: { goal?: string; maxRecommended?: number }
): RankedMenuItem[] {
  const maxRecommended = opts?.maxRecommended ?? 3;
  const calCeiling = Math.max(budget.calories, 150) * 1.05;

  const scored = items
    .map((item) => {
      const m = item.estimatedMacros;
      const { fitScore, fitReason } = scoreRecipeFit(
        { name: item.name, calories: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat },
        budget,
        { goal: opts?.goal }
      );
      return { ...item, fitScore, fitReason, recommended: false };
    })
    .sort((a, b) => b.fitScore - a.fitScore);

  let approved = 0;
  for (const item of scored) {
    if (approved >= maxRecommended) break;
    if (item.fitScore >= MENU_APPROVED_MIN_SCORE && item.estimatedMacros.calories <= calCeiling) {
      item.recommended = true;
      approved++;
    }
  }
  return scored;
}
