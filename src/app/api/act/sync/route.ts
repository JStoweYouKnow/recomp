import { NextRequest, NextResponse } from "next/server";

/**
 * Nova Act overview endpoint — describes available Act-powered automations.
 * Real automation is handled by /api/act/grocery and /api/act/nutrition.
 */
export async function POST(req: NextRequest) {
  const { app } = await req.json().catch(() => ({}));
  const target = app || "MyFitnessPal";

  return NextResponse.json({
    concept: "Nova Act UI Automation",
    message: `Nova Act automates browser-based workflows. Recomp uses it for grocery shopping and nutrition lookup.`,
    capabilities: [
      {
        name: "Grocery Automation",
        endpoint: "/api/act/grocery",
        description: "Automatically searches Amazon Fresh for ingredients from your meal plan",
      },
      {
        name: "Nutrition Lookup",
        endpoint: "/api/act/nutrition",
        description: "Navigates USDA FoodData Central to find detailed nutrition info for any food",
      },
      {
        name: "App Sync (Planned)",
        description: `Future: automate syncing with ${target} — agent logs in, navigates to diary, imports meals/workouts`,
      },
    ],
    novaActDocs: "https://docs.aws.amazon.com/nova-act/latest/userguide/getting-started.html",
    playground: "https://nova.amazon.com/act",
    sdkRepo: "https://github.com/aws/nova-act",
  });
}
