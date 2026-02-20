import { test, expect } from "@playwright/test";

test.describe("Onboarding → Dashboard → Meals flow", () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage for a fresh start
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test("landing page renders with onboarding form", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Your AI-powered")).toBeVisible();
    await expect(page.locator("text=Create my plan")).toBeVisible();
  });

  test("onboarding form accepts input and submits", async ({ page }) => {
    await page.goto("/");

    // Fill basic info
    await page.fill('input[placeholder="Your name"]', "Test User");
    await page.fill('input[placeholder="30"]', "28");
    await page.fill('input[placeholder="154"]', "175");
    await page.fill('input[placeholder="5"]', "5");
    await page.fill('input[placeholder="7"]', "10");

    // Select goal
    await page.selectOption('select >> nth=2', "build_muscle");

    // Submit — this will try to call the API (which may fail without AWS creds)
    // We verify the form submits and shows loading state
    const submitBtn = page.locator("text=Create my plan");
    await submitBtn.click();

    // Should show loading state
    await expect(page.locator("text=Generating your plan with Amazon Nova")).toBeVisible({ timeout: 5000 });
  });

  test("navigation tabs render after onboarding", async ({ page }) => {
    // Seed localStorage with a minimal profile + plan to skip onboarding
    await page.goto("/");
    await page.evaluate(() => {
      const profile = {
        id: "test-123",
        name: "E2E Tester",
        age: 28,
        weight: 80,
        height: 178,
        gender: "male",
        fitnessLevel: "intermediate",
        goal: "build_muscle",
        dietaryRestrictions: [],
        injuriesOrLimitations: [],
        dailyActivityLevel: "moderate",
        workoutLocation: "gym",
        workoutEquipment: ["free_weights", "machines"],
        workoutDaysPerWeek: 4,
        workoutTimeframe: "flexible",
        createdAt: new Date().toISOString(),
      };
      const plan = {
        id: "plan-123",
        dietPlan: {
          dailyTargets: { calories: 2500, protein: 180, carbs: 250, fat: 70 },
          weeklyPlan: [
            { day: "Monday", meals: [{ mealType: "breakfast", description: "Oatmeal", macros: { calories: 400, protein: 15, carbs: 60, fat: 8 } }] },
          ],
        },
        workoutPlan: {
          weeklyPlan: [
            { day: "Monday", focus: "Upper body", exercises: [{ name: "Bench press", sets: "4", reps: "8", notes: "" }] },
          ],
        },
      };
      localStorage.setItem("recomp_profile", JSON.stringify(profile));
      localStorage.setItem("recomp_plan", JSON.stringify(plan));
      localStorage.setItem("recomp_meals", JSON.stringify([]));
    });
    await page.reload();

    // Should show Dashboard with nav tabs
    await expect(page.locator("text=Welcome back, E2E Tester")).toBeVisible({ timeout: 10000 });
    await expect(page.locator('nav[aria-label="Main navigation"]')).toBeVisible();

    // Navigate to Meals
    await page.click("text=Meals");
    await expect(page.locator("text=calories")).toBeVisible({ timeout: 5000 });

    // Navigate to Workouts
    await page.click("text=Workouts");
    await expect(page.locator("text=Monday")).toBeVisible({ timeout: 5000 });

    // Navigate back to Dashboard
    await page.click("text=Dashboard");
    await expect(page.locator("text=Today at a glance")).toBeVisible({ timeout: 5000 });
  });

  test("Reco chat opens and accepts input", async ({ page }) => {
    // Seed profile
    await page.goto("/");
    await page.evaluate(() => {
      const profile = {
        id: "test-123",
        name: "E2E Tester",
        age: 28,
        weight: 80,
        height: 178,
        gender: "male",
        fitnessLevel: "intermediate",
        goal: "build_muscle",
        dietaryRestrictions: [],
        injuriesOrLimitations: [],
        dailyActivityLevel: "moderate",
        workoutLocation: "gym",
        workoutEquipment: ["free_weights"],
        workoutDaysPerWeek: 4,
        workoutTimeframe: "flexible",
        createdAt: new Date().toISOString(),
      };
      localStorage.setItem("recomp_profile", JSON.stringify(profile));
      localStorage.setItem("recomp_plan", JSON.stringify({ id: "p1", dietPlan: { dailyTargets: { calories: 2000, protein: 150, carbs: 200, fat: 65 }, weeklyPlan: [] }, workoutPlan: { weeklyPlan: [] } }));
      localStorage.setItem("recomp_meals", JSON.stringify([]));
    });
    await page.reload();

    // Open Reco chat
    const ricoBtn = page.locator('button[aria-label="Chat with Reco"]');
    await expect(ricoBtn).toBeVisible({ timeout: 10000 });
    await ricoBtn.click();

    // Chat panel should be visible
    await expect(page.locator("text=Reco")).toBeVisible();
    await expect(page.locator('input[placeholder="Ask Reco..."]')).toBeVisible();
  });
});
