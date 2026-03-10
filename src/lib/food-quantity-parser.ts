/**
 * Parses a food input string to extract a numeric quantity and the base food name.
 * Examples:
 *   "3 boiled eggs"      → { quantity: 3, food: "boiled egg" }
 *   "2 cups of rice"     → { quantity: 2, food: "rice" }
 *   "chicken breast"     → { quantity: 1, food: "chicken breast" }
 *   "1/2 avocado"        → { quantity: 0.5, food: "avocado" }
 *   "a banana"           → { quantity: 1, food: "banana" }
 */

const WORD_NUMBERS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  half: 0.5, quarter: 0.25,
};

/** Filler words between quantity and the actual food name */
const FILLER_WORDS = new Set([
  "of", "cup", "cups", "serving", "servings", "piece", "pieces",
  "slice", "slices", "bowl", "bowls", "plate", "plates",
  "portion", "portions", "scoop", "scoops",
]);

/** Singularize a food name naively — handles common plural suffixes */
function singularize(word: string): string {
  if (word.endsWith("ies") && word.length > 4) return word.slice(0, -3) + "y";
  if (word.endsWith("ves")) return word.slice(0, -3) + "f";
  if (word.endsWith("ses") || word.endsWith("ches") || word.endsWith("shes") || word.endsWith("xes") || word.endsWith("zes")) {
    return word.slice(0, -2);
  }
  if (word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us")) return word.slice(0, -1);
  return word;
}

export function parseQuantityAndFood(input: string): { quantity: number; food: string } {
  const trimmed = input.trim();
  if (!trimmed) return { quantity: 1, food: trimmed };

  const tokens = trimmed.split(/\s+/);
  let quantity = 1;
  let startIdx = 0;

  // Try to parse leading number: "3", "0.5", "1/2", "1.5"
  const first = tokens[0].toLowerCase();

  // Fraction like "1/2"
  const fractionMatch = first.match(/^(\d+)\/(\d+)$/);
  if (fractionMatch) {
    quantity = parseInt(fractionMatch[1]) / parseInt(fractionMatch[2]);
    startIdx = 1;
  }
  // Decimal or integer like "3" or "0.5"
  else if (/^\d+(\.\d+)?$/.test(first)) {
    quantity = parseFloat(first);
    startIdx = 1;

    // Check for mixed fraction: "1 1/2" → 1.5
    if (tokens.length > 1) {
      const secondFrac = tokens[1].match(/^(\d+)\/(\d+)$/);
      if (secondFrac) {
        quantity += parseInt(secondFrac[1]) / parseInt(secondFrac[2]);
        startIdx = 2;
      }
    }
  }
  // Word number like "three" or "a"
  else if (first in WORD_NUMBERS) {
    quantity = WORD_NUMBERS[first];
    startIdx = 1;
  }

  // Skip filler words like "cups of", "servings of"
  while (startIdx < tokens.length && FILLER_WORDS.has(tokens[startIdx].toLowerCase())) {
    startIdx++;
  }

  let food = tokens.slice(startIdx).join(" ").trim();
  if (!food) food = trimmed; // No parseable food name — use original

  // Singularize the last word if quantity > 1 (e.g., "boiled eggs" → "boiled egg")
  if (quantity > 1 && food.includes(" ")) {
    const parts = food.split(" ");
    parts[parts.length - 1] = singularize(parts[parts.length - 1]);
    food = parts.join(" ");
  } else if (quantity > 1) {
    food = singularize(food);
  }

  return { quantity: Math.max(0.01, quantity), food };
}

/**
 * Common foods nutrition database (per single unit/serving).
 * Values are approximate USDA-based values for typical servings.
 */
export const COMMON_FOODS: Record<string, { calories: number; protein: number; carbs: number; fat: number; servingNote?: string }> = {
  // Eggs
  "egg": { calories: 78, protein: 6, carbs: 0.6, fat: 5, servingNote: "1 large egg" },
  "boiled egg": { calories: 78, protein: 6, carbs: 0.6, fat: 5, servingNote: "1 large boiled egg" },
  "hard boiled egg": { calories: 78, protein: 6, carbs: 0.6, fat: 5, servingNote: "1 large hard boiled egg" },
  "fried egg": { calories: 90, protein: 6, carbs: 0.4, fat: 7, servingNote: "1 large fried egg" },
  "scrambled egg": { calories: 91, protein: 6, carbs: 1, fat: 7, servingNote: "1 large scrambled egg" },

  // Proteins
  "chicken breast": { calories: 165, protein: 31, carbs: 0, fat: 3.6, servingNote: "100g cooked" },
  "salmon": { calories: 208, protein: 20, carbs: 0, fat: 13, servingNote: "100g cooked" },
  "turkey": { calories: 135, protein: 30, carbs: 0, fat: 1, servingNote: "100g cooked" },
  "beef": { calories: 254, protein: 17, carbs: 0, fat: 20, servingNote: "100g cooked" },
  "tofu": { calories: 76, protein: 8, carbs: 1.9, fat: 4.8, servingNote: "100g" },
  "shrimp": { calories: 85, protein: 20, carbs: 0.2, fat: 0.5, servingNote: "100g cooked" },
  "tuna": { calories: 132, protein: 28, carbs: 0, fat: 1.3, servingNote: "100g" },
  "greek yogurt": { calories: 100, protein: 17, carbs: 6, fat: 0.7, servingNote: "170g container" },

  // Grains & carbs
  "rice": { calories: 206, protein: 4.3, carbs: 45, fat: 0.4, servingNote: "1 cup cooked" },
  "brown rice": { calories: 216, protein: 5, carbs: 45, fat: 1.8, servingNote: "1 cup cooked" },
  "pasta": { calories: 220, protein: 8, carbs: 43, fat: 1.3, servingNote: "1 cup cooked" },
  "oats": { calories: 154, protein: 5, carbs: 27, fat: 2.6, servingNote: "1/2 cup dry" },
  "oatmeal": { calories: 154, protein: 5, carbs: 27, fat: 2.6, servingNote: "1/2 cup dry" },
  "bread": { calories: 79, protein: 3, carbs: 15, fat: 1, servingNote: "1 slice" },
  "quinoa": { calories: 222, protein: 8, carbs: 39, fat: 3.6, servingNote: "1 cup cooked" },
  "sweet potato": { calories: 103, protein: 2, carbs: 24, fat: 0.1, servingNote: "1 medium" },
  "potato": { calories: 161, protein: 4, carbs: 37, fat: 0.2, servingNote: "1 medium" },
  "tortilla": { calories: 120, protein: 3, carbs: 20, fat: 3, servingNote: "1 medium flour tortilla" },

  // Fruits
  "banana": { calories: 105, protein: 1.3, carbs: 27, fat: 0.4, servingNote: "1 medium" },
  "apple": { calories: 95, protein: 0.5, carbs: 25, fat: 0.3, servingNote: "1 medium" },
  "orange": { calories: 62, protein: 1.2, carbs: 15, fat: 0.2, servingNote: "1 medium" },
  "avocado": { calories: 240, protein: 3, carbs: 13, fat: 22, servingNote: "1 whole" },
  "blueberries": { calories: 84, protein: 1, carbs: 21, fat: 0.5, servingNote: "1 cup" },
  "strawberries": { calories: 49, protein: 1, carbs: 12, fat: 0.5, servingNote: "1 cup" },

  // Vegetables
  "broccoli": { calories: 55, protein: 3.7, carbs: 11, fat: 0.6, servingNote: "1 cup cooked" },
  "spinach": { calories: 41, protein: 5, carbs: 7, fat: 0.5, servingNote: "1 cup cooked" },
  "carrot": { calories: 25, protein: 0.6, carbs: 6, fat: 0.1, servingNote: "1 medium" },
  "salad": { calories: 20, protein: 1.5, carbs: 3.5, fat: 0.2, servingNote: "2 cups mixed greens" },

  // Nuts & seeds
  "almonds": { calories: 164, protein: 6, carbs: 6, fat: 14, servingNote: "1 oz (23 almonds)" },
  "peanut butter": { calories: 188, protein: 7, carbs: 6, fat: 16, servingNote: "2 tbsp" },
  "walnuts": { calories: 185, protein: 4.3, carbs: 3.9, fat: 18.5, servingNote: "1 oz" },

  // Dairy
  "milk": { calories: 149, protein: 8, carbs: 12, fat: 8, servingNote: "1 cup whole" },
  "cheese": { calories: 113, protein: 7, carbs: 0.4, fat: 9, servingNote: "1 oz cheddar" },
  "butter": { calories: 102, protein: 0.1, carbs: 0, fat: 12, servingNote: "1 tbsp" },

  // Common meals
  "protein shake": { calories: 150, protein: 25, carbs: 8, fat: 2, servingNote: "1 scoop with water" },
  "protein bar": { calories: 200, protein: 20, carbs: 22, fat: 7, servingNote: "1 bar" },
};

/**
 * Look up a food in the common foods database, trying exact match,
 * then substring match.
 */
export function lookupCommonFood(food: string): { calories: number; protein: number; carbs: number; fat: number } | null {
  const lower = food.toLowerCase().trim();

  // Exact match
  if (COMMON_FOODS[lower]) {
    const { calories, protein, carbs, fat } = COMMON_FOODS[lower];
    return { calories, protein, carbs, fat };
  }

  // Fuzzy: check if any key is contained in the food or vice versa
  for (const [key, val] of Object.entries(COMMON_FOODS)) {
    if (lower.includes(key) || key.includes(lower)) {
      return { calories: val.calories, protein: val.protein, carbs: val.carbs, fat: val.fat };
    }
  }

  return null;
}
