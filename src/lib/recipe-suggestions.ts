/**
 * Curated atypical recipes with real URLs and nutrition.
 * Filtered by calorie budget to achieve goals. Sources: Budget Bytes, AllRecipes, BBC Good Food.
 */

export interface CuratedRecipe {
  name: string;
  url: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Which goals this recipe suits best */
  goals: ("lose_weight" | "maintain" | "build_muscle" | "improve_endurance")[];
  /** Meal types */
  mealTypes: ("breakfast" | "lunch" | "dinner" | "snack")[];
}

export const CURATED_RECIPES: CuratedRecipe[] = [
  // lose_weight — high volume, filling, lower cal
  { name: "Shakshuka", url: "https://www.budgetbytes.com/shakshuka/", calories: 195, protein: 10, carbs: 12, fat: 12, goals: ["lose_weight", "maintain"], mealTypes: ["breakfast", "lunch", "dinner"] },
  { name: "Smoky White Bean Shakshuka", url: "https://www.budgetbytes.com/smoky-white-bean-shakshuka/", calories: 220, protein: 12, carbs: 18, fat: 11, goals: ["lose_weight", "maintain"], mealTypes: ["breakfast", "lunch", "dinner"] },
  { name: "Crunchy Kale and Chicken Salad", url: "https://www.budgetbytes.com/crunchy-kale-chicken-salad/", calories: 385, protein: 32, carbs: 18, fat: 21, goals: ["lose_weight", "maintain", "build_muscle"], mealTypes: ["lunch", "dinner"] },
  { name: "Turkey Taco Salad", url: "https://www.budgetbytes.com/turkey-taco-salad/", calories: 365, protein: 28, carbs: 22, fat: 18, goals: ["lose_weight", "maintain"], mealTypes: ["lunch", "dinner"] },
  { name: "Mujadara (Lentils & Rice)", url: "https://www.budgetbytes.com/mujadara/", calories: 285, protein: 10, carbs: 45, fat: 8, goals: ["lose_weight", "maintain", "improve_endurance"], mealTypes: ["lunch", "dinner"] },
  { name: "Savory Oatmeal with Egg", url: "https://www.budgetbytes.com/savory-oatmeal/", calories: 245, protein: 11, carbs: 28, fat: 10, goals: ["lose_weight", "maintain", "improve_endurance"], mealTypes: ["breakfast"] },
  { name: "Black Beans with Eggs", url: "https://www.budgetbytes.com/black-beans-with-eggs/", calories: 275, protein: 14, carbs: 32, fat: 10, goals: ["lose_weight", "maintain", "build_muscle"], mealTypes: ["breakfast", "lunch", "dinner"] },
  { name: "Salsa Poached Eggs", url: "https://www.budgetbytes.com/salsa-poached-eggs-grits/", calories: 210, protein: 11, carbs: 22, fat: 9, goals: ["lose_weight", "maintain"], mealTypes: ["breakfast"] },
  { name: "Chana Masala", url: "https://www.budgetbytes.com/chana-masala/", calories: 265, protein: 11, carbs: 42, fat: 6, goals: ["lose_weight", "maintain", "improve_endurance"], mealTypes: ["lunch", "dinner"] },
  { name: "Turkish Eggs (Cilbir)", url: "https://www.bbcgoodfood.com/recipes/turkish-eggs", calories: 290, protein: 14, carbs: 8, fat: 23, goals: ["lose_weight", "maintain"], mealTypes: ["breakfast"] },
  // maintain — balanced, varied
  { name: "Roasted Broccoli Pasta with Lemon and Feta", url: "https://www.budgetbytes.com/roasted-broccoli-pasta-with-lemon-and-feta/", calories: 395, protein: 14, carbs: 48, fat: 17, goals: ["maintain", "improve_endurance"], mealTypes: ["lunch", "dinner"] },
  { name: "Smoky Roasted Sausage and Vegetables", url: "https://www.budgetbytes.com/smoky-roasted-sausage-and-vegetables/", calories: 420, protein: 18, carbs: 32, fat: 26, goals: ["maintain", "build_muscle"], mealTypes: ["dinner"] },
  { name: "Japanese Curry with Rice", url: "https://www.budgetbytes.com/japanese-curry/", calories: 485, protein: 16, carbs: 68, fat: 17, goals: ["maintain", "improve_endurance"], mealTypes: ["lunch", "dinner"] },
  { name: "Bibimbap Bowl", url: "https://www.allrecipes.com/recipe/228823/bibimbap-korean-rice-with-mixed-vegetables/", calories: 465, protein: 18, carbs: 58, fat: 18, goals: ["maintain", "improve_endurance"], mealTypes: ["lunch", "dinner"] },
  { name: "Ethiopian Lentils (Misir Wot)", url: "https://www.budgetbytes.com/ethiopian-red-lentils-misir-wot/", calories: 205, protein: 12, carbs: 32, fat: 3, goals: ["lose_weight", "maintain"], mealTypes: ["lunch", "dinner"] },
  { name: "Okonomiyaki (Japanese Pancake)", url: "https://www.seriouseats.com/okonomiyaki-japanese-savory-pancake-recipe", calories: 380, protein: 14, carbs: 42, fat: 18, goals: ["maintain", "build_muscle"], mealTypes: ["lunch", "dinner"] },
  { name: "Congee (Rice Porridge)", url: "https://www.bbcgoodfood.com/recipes/congee", calories: 185, protein: 8, carbs: 28, fat: 4, goals: ["lose_weight", "maintain", "improve_endurance"], mealTypes: ["breakfast"] },
  { name: "Korean Beef Bowl", url: "https://www.budgetbytes.com/korean-beef-bowl/", calories: 445, protein: 22, carbs: 52, fat: 17, goals: ["maintain", "build_muscle"], mealTypes: ["lunch", "dinner"] },
  // build_muscle — protein-dense
  { name: "Chicken Tinga Tacos", url: "https://www.budgetbytes.com/chicken-tinga-tacos/", calories: 355, protein: 28, carbs: 32, fat: 14, goals: ["build_muscle", "maintain"], mealTypes: ["lunch", "dinner"] },
  { name: "Creamy Chipotle Chicken", url: "https://www.budgetbytes.com/creamy-chipotle-chicken/", calories: 395, protein: 35, carbs: 12, fat: 24, goals: ["build_muscle", "maintain"], mealTypes: ["lunch", "dinner"] },
  { name: "Garlic Herb Baked Salmon", url: "https://www.budgetbytes.com/garlic-herb-baked-salmon/", calories: 385, protein: 34, carbs: 2, fat: 27, goals: ["build_muscle", "lose_weight", "maintain"], mealTypes: ["lunch", "dinner"] },
  { name: "Sheet Pan Lemon Herb Chicken", url: "https://www.budgetbytes.com/sheet-pan-lemon-herb-chicken-and-veggies/", calories: 420, protein: 38, carbs: 22, fat: 21, goals: ["build_muscle", "maintain"], mealTypes: ["dinner"] },
  { name: "Protein Pancakes", url: "https://www.budgetbytes.com/protein-pancakes/", calories: 325, protein: 28, carbs: 32, fat: 10, goals: ["build_muscle", "maintain"], mealTypes: ["breakfast"] },
  // improve_endurance — carb-focused
  { name: "Peanut Butter Overnight Oats", url: "https://www.budgetbytes.com/peanut-butter-overnight-oats/", calories: 410, protein: 14, carbs: 48, fat: 18, goals: ["improve_endurance", "maintain"], mealTypes: ["breakfast", "snack"] },
  { name: "Sweet Potato and Black Bean Burritos", url: "https://www.budgetbytes.com/sweet-potato-black-bean-burritos/", calories: 455, protein: 14, carbs: 68, fat: 16, goals: ["improve_endurance", "maintain"], mealTypes: ["lunch", "dinner"] },
  { name: "Mediterranean Chickpea Salad", url: "https://www.budgetbytes.com/mediterranean-chickpea-salad/", calories: 285, protein: 10, carbs: 38, fat: 11, goals: ["lose_weight", "maintain", "improve_endurance"], mealTypes: ["lunch", "snack"] },
  { name: "Red Lentil Dal", url: "https://www.budgetbytes.com/red-lentil-dal/", calories: 295, protein: 14, carbs: 44, fat: 6, goals: ["lose_weight", "maintain", "improve_endurance"], mealTypes: ["lunch", "dinner"] },
  { name: "Vegetable Fried Rice", url: "https://www.budgetbytes.com/vegetable-fried-rice/", calories: 385, protein: 12, carbs: 52, fat: 15, goals: ["maintain", "improve_endurance"], mealTypes: ["lunch", "dinner"] },
];

/** Filter recipes by remaining calories (±25% flexibility), goal, and optional meal type */
export function getRecipesForBudget(
  remainingCalories: number,
  goal: string,
  mealType?: string,
  limit = 5
): CuratedRecipe[] {
  const minCal = Math.max(100, remainingCalories * 0.5);
  const maxCal = remainingCalories * 1.25;
  const goalKey = goal as CuratedRecipe["goals"][number];

  return CURATED_RECIPES.filter((r) => {
    if (r.calories < minCal || r.calories > maxCal) return false;
    if (goalKey && !r.goals.includes(goalKey)) return false;
    if (mealType && !r.mealTypes.includes(mealType as CuratedRecipe["mealTypes"][number])) return false;
    return true;
  })
    .sort(() => Math.random() - 0.5) // shuffle for variety
    .slice(0, limit);
}
