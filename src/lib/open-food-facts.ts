/**
 * Open Food Facts API - free, no cost limits.
 * Used for core nutrition lookup (packaged foods, barcode, search).
 * @see https://wiki.openfoodfacts.org/API
 */

export interface OFFProduct {
  product_name?: string;
  nutriments?: Record<string, number | undefined>;
  quantity?: string;
  serving_size?: string;
}

export interface OFFSearchResult {
  count: number;
  page: number;
  page_count: number;
  page_size: number;
  products: OFFProduct[];
}

export interface NutritionResult {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: "openfoodfacts";
  productName?: string;
}

const BASE = "https://world.openfoodfacts.net";

function extractNutrition(p: OFFProduct): NutritionResult | null {
  const n = p?.nutriments ?? {};
  let calories = (n["energy-kcal_serving"] ?? n["energy-kcal_100g"]) as number | undefined;
  if (calories == null) {
    const kj = (n["energy-kj_serving"] ?? n["energy-kj_100g"]) as number | undefined;
    if (typeof kj === "number") calories = Math.round(kj / 4.184);
  }
  const protein = (n["proteins_serving"] ?? n["proteins_100g"]) as number | undefined;
  const carbs = (n["carbohydrates_serving"] ?? n["carbohydrates_100g"]) as number | undefined;
  const fat = (n["fat_serving"] ?? n["fat_100g"]) as number | undefined;

  if (calories == null && protein == null && carbs == null && fat == null) return null;

  return {
    calories: Math.round(calories ?? 0),
    protein: Math.round(protein ?? 0),
    carbs: Math.round(carbs ?? 0),
    fat: Math.round(fat ?? 0),
    source: "openfoodfacts",
    productName: p.product_name,
  };
}

/** Search Open Food Facts by text. Returns first product with usable nutrition. */
export async function searchOpenFoodFacts(query: string): Promise<NutritionResult | null> {
  const q = encodeURIComponent(query.trim());
  if (!q) return null;

  const url = `${BASE}/api/v2/search?text=${q}&page_size=10`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Recomp/1.0 (nutrition app)" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;

  const data = (await res.json()) as OFFSearchResult;
  const products = data?.products ?? [];

  for (const p of products) {
    const out = extractNutrition(p);
    if (out && (out.calories > 0 || out.protein > 0 || out.carbs > 0 || out.fat > 0)) {
      return out;
    }
  }
  return null;
}

/** Get product by barcode. */
export async function getProductByBarcode(barcode: string): Promise<NutritionResult | null> {
  const clean = String(barcode).replace(/\D/g, "").slice(0, 13);
  if (!clean) return null;

  const url = `${BASE}/api/v2/product/${clean}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Recomp/1.0 (nutrition app)" },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return null;

  const data = (await res.json()) as { product?: OFFProduct };
  const p = data?.product;
  if (!p) return null;

  const out = extractNutrition(p);
  return out && (out.calories > 0 || out.protein > 0 || out.carbs > 0 || out.fat > 0) ? out : null;
}
