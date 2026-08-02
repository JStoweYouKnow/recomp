import {
  dbGetActivityLog,
  dbGetMeals,
  dbGetPantry,
  dbGetPlan,
  dbGetProfile,
  dbGetSavedRecipes,
} from "@/lib/db";
import {
  buildUserRecipeContext,
  type UserRecipeContext,
} from "@/lib/user-recipe-context";
import { remainingMacros } from "@/lib/recipe-fit";
import type { Macros } from "@/lib/types";
import type { MealTypeValue } from "@/lib/meal-quick-picks";

export async function loadUserRecipeContextForUser(
  userId: string,
  date: string,
  opts?: {
    macroTargets?: Macros;
    todayMacros?: Macros;
    goal?: string;
    mealType?: MealTypeValue;
  },
): Promise<UserRecipeContext> {
  const [meals, pantry, activityLog, savedRecipes, profile, plan] = await Promise.all([
    dbGetMeals(userId),
    dbGetPantry(userId).catch(() => []),
    dbGetActivityLog(userId).catch(() => []),
    dbGetSavedRecipes(userId).catch(() => []),
    dbGetProfile(userId).catch(() => null),
    dbGetPlan(userId).catch(() => null),
  ]);

  const targets =
    opts?.macroTargets ??
    plan?.dietPlan?.dailyTargets ?? {
      calories: 2000,
      protein: 150,
      carbs: 200,
      fat: 65,
    };

  const consumed =
    opts?.todayMacros ??
    meals
      .filter((m) => m.date === date.slice(0, 10))
      .reduce(
        (acc, m) => ({
          calories: acc.calories + m.macros.calories,
          protein: acc.protein + m.macros.protein,
          carbs: acc.carbs + m.macros.carbs,
          fat: acc.fat + m.macros.fat,
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 },
      );

  const budget = remainingMacros(targets, consumed);

  return buildUserRecipeContext({
    meals,
    pantry,
    activityLog,
    savedRecipes,
    profile,
    date: date.slice(0, 10),
    mealType: opts?.mealType,
    remainingCalories: budget.calories,
    remainingProtein: budget.protein,
    goal: opts?.goal ?? profile?.goal,
  });
}
