import { NextRequest, NextResponse } from "next/server";
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";

/** Multi-agent review with web grounding needs extended timeout */
export const maxDuration = 60;
import type { Tool, ToolConfiguration } from "@aws-sdk/client-bedrock-runtime";
import type { MealEntry, Macros, WearableDaySummary } from "@/lib/types";
import { NOVA_LITE_MODEL_ID } from "@/lib/nova";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
const REGION = process.env.AWS_REGION ?? "us-east-1";
const MAX_TOOL_ROUNDS = 4;

// ---------------------------------------------------------------------------
// Agent system prompts — each specialist has a focused personality and goal
// ---------------------------------------------------------------------------

const COORDINATOR_SYSTEM = `You are the coordinator agent for a fitness review system. Your job is to synthesize reports from specialist agents into a single comprehensive weekly review.

You will receive:
1. A meal analysis report from the Meal Analyst agent
2. A wellness report from the Wellness agent (wearable data + research)

Based on these reports, produce a final structured review as JSON:
{
  "summary": "2-3 sentence high-level summary",
  "mealAnalysis": "Key findings about nutrition patterns",
  "wearableInsights": "Key findings from wearable/wellness data",
  "recommendations": ["actionable recommendation 1", "recommendation 2", ...],
  "weeklyScore": number from 1-10,
  "reasoning": "Brief explanation of your scoring and recommendations"
}

Be concrete and actionable. No generic advice — tailor everything to the data.`;

const MEAL_AGENT_SYSTEM = `You are the Meal Analyst agent for a fitness review system. You specialize in nutritional analysis.

You have tools to analyze the user's meal data. Use them to understand:
- Logging consistency (how many days, meals per day)
- Macro adherence (calories, protein, carbs, fat vs targets)
- Meal timing patterns
- Nutritional gaps or excesses

After analysis, produce a concise report with specific findings and concerns. Focus on patterns, not individual meals.`;

const WELLNESS_AGENT_SYSTEM = `You are the Wellness agent for a fitness review system. You specialize in wearable data analysis and evidence-based health research.

You have tools to:
1. Check wearable data (sleep, activity, heart rate)
2. Research current nutrition/fitness guidelines

Use both tools to produce a report that connects the user's biometrics to actionable wellness insights. If no wearable data is available, focus on research relevant to their goal.`;

// ---------------------------------------------------------------------------
// Tool definitions for each specialist agent
// ---------------------------------------------------------------------------

function buildMealAgentTools(): ToolConfiguration {
  const tools: Tool[] = [
    {
      toolSpec: {
        name: "analyze_meals",
        description:
          "Analyze the user's meal logging data. Returns patterns, macro adherence, consistency metrics, and gaps.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              focus: {
                type: "string",
                description:
                  "What aspect to analyze: 'adherence', 'patterns', 'gaps', or 'all'",
              },
            },
            required: ["focus"],
          },
        },
      },
    },
  ];
  return { tools };
}

function buildWellnessAgentTools(): ToolConfiguration {
  const tools: Tool[] = [
    {
      toolSpec: {
        name: "check_wearables",
        description:
          "Review wearable device data including sleep scores, step counts, heart rate, and activity minutes.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              metric: {
                type: "string",
                description:
                  "Which metric to check: 'sleep', 'activity', 'heart_rate', or 'all'",
              },
            },
            required: ["metric"],
          },
        },
      },
    },
    {
      toolSpec: {
        name: "research_nutrition",
        description:
          "Search for current nutrition and fitness guidelines relevant to the user's goal using web grounding.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "The nutrition or fitness topic to research",
              },
            },
            required: ["query"],
          },
        },
      },
    },
  ];
  return { tools };
}

// ---------------------------------------------------------------------------
// Tool execution functions (shared data processors)
// ---------------------------------------------------------------------------

function executeMealAnalysis(
  meals: MealEntry[],
  targets: Macros,
  _focus: string
): string {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const recent = meals.filter((m) => new Date(m.date) >= weekAgo);

  const byDate: Record<string, MealEntry[]> = {};
  for (const m of recent) {
    (byDate[m.date] ??= []).push(m);
  }

  const daysLogged = Object.keys(byDate).length;
  const dailyTotals = Object.entries(byDate).map(([date, dayMeals]) => ({
    date,
    calories: dayMeals.reduce((s, m) => s + m.macros.calories, 0),
    protein: dayMeals.reduce((s, m) => s + m.macros.protein, 0),
    carbs: dayMeals.reduce((s, m) => s + m.macros.carbs, 0),
    fat: dayMeals.reduce((s, m) => s + m.macros.fat, 0),
    mealCount: dayMeals.length,
  }));

  const avgCal = dailyTotals.length
    ? Math.round(
        dailyTotals.reduce((s, d) => s + d.calories, 0) / dailyTotals.length
      )
    : 0;
  const avgPro = dailyTotals.length
    ? Math.round(
        dailyTotals.reduce((s, d) => s + d.protein, 0) / dailyTotals.length
      )
    : 0;
  const daysHitCalories = dailyTotals.filter(
    (d) => Math.abs(d.calories - targets.calories) / targets.calories <= 0.15
  ).length;
  const daysHitProtein = dailyTotals.filter(
    (d) => d.protein >= targets.protein * 0.9
  ).length;

  const mealTypes = recent.reduce(
    (acc, m) => {
      acc[m.mealType] = (acc[m.mealType] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return JSON.stringify({
    daysLogged,
    totalMeals: recent.length,
    avgDailyCalories: avgCal,
    avgDailyProtein: avgPro,
    targetCalories: targets.calories,
    targetProtein: targets.protein,
    daysHitCalories,
    daysHitProtein,
    mealTypeBreakdown: mealTypes,
    dailyDetails: dailyTotals,
    consistency:
      daysLogged >= 5
        ? "good"
        : daysLogged >= 3
          ? "moderate"
          : "needs improvement",
  });
}

function executeWearableAnalysis(
  wearableData: WearableDaySummary[],
  metric: string
): string {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const recent = wearableData.filter((d) => new Date(d.date) >= weekAgo);

  if (recent.length === 0) {
    return JSON.stringify({
      message:
        "No wearable data available for this week. User has not connected a wearable device.",
    });
  }

  const result: Record<string, unknown> = { daysWithData: recent.length };

  if (metric === "sleep" || metric === "all") {
    const sleepScores = recent
      .filter((d) => d.sleepScore != null)
      .map((d) => d.sleepScore!);
    const sleepDurations = recent
      .filter((d) => d.sleepDuration != null)
      .map((d) => d.sleepDuration!);
    result.sleep = {
      avgScore: sleepScores.length
        ? Math.round(
            sleepScores.reduce((s, v) => s + v, 0) / sleepScores.length
          )
        : null,
      avgDurationMinutes: sleepDurations.length
        ? Math.round(
            sleepDurations.reduce((s, v) => s + v, 0) / sleepDurations.length
          )
        : null,
      dataPoints: sleepScores.length,
    };
  }

  if (metric === "activity" || metric === "all") {
    const steps = recent
      .filter((d) => d.steps != null)
      .map((d) => d.steps!);
    const active = recent
      .filter((d) => d.activeMinutes != null)
      .map((d) => d.activeMinutes!);
    const burned = recent
      .filter((d) => d.caloriesBurned != null)
      .map((d) => d.caloriesBurned!);
    result.activity = {
      avgSteps: steps.length
        ? Math.round(steps.reduce((s, v) => s + v, 0) / steps.length)
        : null,
      avgActiveMinutes: active.length
        ? Math.round(active.reduce((s, v) => s + v, 0) / active.length)
        : null,
      avgCaloriesBurned: burned.length
        ? Math.round(burned.reduce((s, v) => s + v, 0) / burned.length)
        : null,
    };
  }

  if (metric === "heart_rate" || metric === "all") {
    const hrAvg = recent
      .filter((d) => d.heartRateAvg != null)
      .map((d) => d.heartRateAvg!);
    const hrRest = recent
      .filter((d) => d.heartRateResting != null)
      .map((d) => d.heartRateResting!);
    result.heartRate = {
      avgHR: hrAvg.length
        ? Math.round(hrAvg.reduce((s, v) => s + v, 0) / hrAvg.length)
        : null,
      avgRestingHR: hrRest.length
        ? Math.round(hrRest.reduce((s, v) => s + v, 0) / hrRest.length)
        : null,
    };
  }

  const readiness = recent
    .filter((d) => d.readinessScore != null)
    .map((d) => d.readinessScore!);
  if (readiness.length > 0) {
    result.avgReadiness = Math.round(
      readiness.reduce((s, v) => s + v, 0) / readiness.length
    );
  }

  return JSON.stringify(result);
}

async function executeResearch(query: string): Promise<string> {
  try {
    const { invokeNovaWithWebGrounding } = await import("@/lib/nova");
    const result = await invokeNovaWithWebGrounding(
      "You are a nutrition research assistant. Provide concise, evidence-based information.",
      query,
      { temperature: 0.4, maxTokens: 512 }
    );
    return result.slice(0, 1000);
  } catch {
    return "Web research unavailable. Proceeding with existing knowledge.";
  }
}

// ---------------------------------------------------------------------------
// Agent runner — runs a specialist agent through its tool-use loop
// ---------------------------------------------------------------------------

interface AgentResult {
  output: string;
  steps: { tool: string; summary: string }[];
}

async function runAgent(
  client: BedrockRuntimeClient,
  systemPrompt: string,
  userPrompt: string,
  toolConfig: ToolConfiguration,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toolExecutor: (name: string, input: any) => Promise<string>
): Promise<AgentResult> {
  const steps: { tool: string; summary: string }[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let messages: any[] = [
    { role: "user", content: [{ text: userPrompt }] },
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.send(
      new ConverseCommand({
        modelId: NOVA_LITE_MODEL_ID,
        messages,
        system: [{ text: systemPrompt }],
        toolConfig,
        inferenceConfig: { temperature: 0.6, maxTokens: 4096, topP: 0.9 },
      })
    );

    const output = response.output?.message;
    if (!output) break;

    messages = [...messages, { role: "assistant", content: output.content }];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolUses = (output.content ?? []).filter((c: any) => "toolUse" in c);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const textBlocks = (output.content ?? []).filter((c: any) => "text" in c);

    if (toolUses.length === 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const finalText = textBlocks.map((b: any) => b.text).join("\n");
      return { output: finalText, steps };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolResults: any[] = [];
    for (const tc of toolUses) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { toolUseId, name, input } = (tc as any).toolUse;
      const result = await toolExecutor(name, input);
      steps.push({ tool: name, summary: `${name}(${JSON.stringify(input).slice(0, 80)})` });
      toolResults.push({
        toolResult: { toolUseId, content: [{ text: result }] },
      });
    }

    messages = [...messages, { role: "user", content: toolResults }];
  }

  return { output: "Agent reached maximum rounds without final response.", steps };
}

// ---------------------------------------------------------------------------
// POST handler — multi-agent orchestration
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const rl = fixedWindowRateLimit(
    getClientKey(getRequestIp(req), "weekly-review"),
    5,
    60_000
  );
  if (!rl.ok)
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  try {
    const { meals, targets, wearableData, goal, userName } = await req.json();

    const client = new BedrockRuntimeClient({ region: REGION });
    const safeTargets = (targets as Macros) ?? {
      calories: 2000,
      protein: 150,
      carbs: 200,
      fat: 65,
    };
    const safeMeals = (meals as MealEntry[]) ?? [];
    const safeWearable = (wearableData as WearableDaySummary[]) ?? [];
    const safeGoal = goal || "general fitness";
    const safeName = userName || "the user";

    // -----------------------------------------------------------------------
    // Dynamic agent routing: examine available data to decide which
    // specialist agents to invoke, rather than always running all.
    // -----------------------------------------------------------------------

    const hasMealData = safeMeals.length > 0;
    const hasWearableData = safeWearable.length > 0;

    const agentPromises: Promise<{ agent: string; result: AgentResult }>[] = [];

    // Run meal agent only when meal data exists
    if (hasMealData) {
      agentPromises.push(
        runAgent(
          client,
          MEAL_AGENT_SYSTEM,
          `Analyze the meal data for ${safeName}. Their goal is ${safeGoal}.\nDaily targets: ${JSON.stringify(safeTargets)}.\n\nUse the analyze_meals tool with focus 'all' to get the full picture, then produce your report.`,
          buildMealAgentTools(),
          async (name, input) => {
            if (name === "analyze_meals") {
              return executeMealAnalysis(safeMeals, safeTargets, (input as { focus: string }).focus);
            }
            return JSON.stringify({ error: `Unknown tool: ${name}` });
          }
        ).then((result) => ({ agent: "Meal Analyst", result }))
      );
    }

    // Run wellness agent with wearables, or research-only variant without
    if (hasWearableData) {
      agentPromises.push(
        runAgent(
          client,
          WELLNESS_AGENT_SYSTEM,
          `Analyze wellness data for ${safeName}. Their goal is ${safeGoal}.\n\nUse check_wearables with metric 'all' to review their biometrics, then use research_nutrition to find relevant guidelines for their goal. Produce a comprehensive wellness report.`,
          buildWellnessAgentTools(),
          async (name, input) => {
            if (name === "check_wearables") {
              return executeWearableAnalysis(safeWearable, (input as { metric: string }).metric);
            }
            if (name === "research_nutrition") {
              return await executeResearch((input as { query: string }).query);
            }
            return JSON.stringify({ error: `Unknown tool: ${name}` });
          }
        ).then((result) => ({ agent: "Wellness Agent", result }))
      );
    } else {
      // No wearable data — run research-only wellness agent
      agentPromises.push(
        runAgent(
          client,
          WELLNESS_AGENT_SYSTEM,
          `The user ${safeName} has not connected a wearable device. Their goal is ${safeGoal}.\n\nSkip check_wearables (no data available). Instead, use research_nutrition to find current evidence-based guidelines relevant to their goal. Produce a wellness report focused on research findings.`,
          buildWellnessAgentTools(),
          async (name, input) => {
            if (name === "check_wearables") {
              return JSON.stringify({ message: "No wearable data available. User has not connected a device." });
            }
            if (name === "research_nutrition") {
              return await executeResearch((input as { query: string }).query);
            }
            return JSON.stringify({ error: `Unknown tool: ${name}` });
          }
        ).then((result) => ({ agent: "Wellness Agent (research-only)", result }))
      );
    }

    const agentResults = await Promise.all(agentPromises);

    // Build specialist reports map
    const mealResult = agentResults.find((r) => r.agent.startsWith("Meal"))?.result
      ?? { output: `No meal data available for ${safeName} this week. They haven't logged any meals yet.`, steps: [] };
    const wellnessResult = agentResults.find((r) => r.agent.startsWith("Wellness"))?.result
      ?? { output: "No wellness data available.", steps: [] };

    // Track routing decision for transparency
    const routingDecision = {
      mealAgentRun: hasMealData,
      wellnessMode: hasWearableData ? "full" : "research-only",
      agentsInvoked: agentResults.map((r) => r.agent),
    };

    // -----------------------------------------------------------------------
    // Step 3: Coordinator synthesizes specialist reports into final review
    // -----------------------------------------------------------------------

    const coordinatorResponse = await client.send(
      new ConverseCommand({
        modelId: NOVA_LITE_MODEL_ID,
        messages: [
          {
            role: "user",
            content: [
              {
                text: `You are producing a weekly fitness review for ${safeName} (goal: ${safeGoal}).

Here is the Meal Analyst agent's report:
---
${mealResult.output}
---

Here is the Wellness agent's report:
---
${wellnessResult.output}
---

Now synthesize these into a single structured JSON review. Respond with valid JSON only, no markdown:
{
  "summary": "2-3 sentence overview",
  "mealAnalysis": "key nutrition findings",
  "wearableInsights": "key wellness findings",
  "recommendations": ["rec 1", "rec 2", "rec 3"],
  "weeklyScore": number 1-10,
  "reasoning": "why this score and these recommendations"
}`,
              },
            ],
          },
        ],
        system: [{ text: COORDINATOR_SYSTEM }],
        inferenceConfig: { temperature: 0.5, maxTokens: 2048, topP: 0.9 },
      })
    );

    const coordContent = coordinatorResponse.output?.message?.content ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const coordText = coordContent
      .filter((c: { text?: string }) => "text" in c)
      .map((c: { text?: string }) => (c as { text: string }).text)
      .join("\n");

    // Parse the coordinator's JSON output
    let review;
    try {
      const jsonMatch = coordText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        review = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Fall through to fallback
    }

    if (!review) {
      review = {
        summary: coordText.slice(0, 500),
        mealAnalysis: mealResult.output.slice(0, 300),
        wearableInsights: wellnessResult.output.slice(0, 300),
        recommendations: [coordText.slice(0, 200)],
        weeklyScore: 5,
        reasoning:
          "Multi-agent analysis completed. Review generated from specialist reports.",
      };
    }

    // Collect all agent steps for transparency
    const agentSteps = [
      ...mealResult.steps.map((s) => ({
        agent: "Meal Analyst",
        tool: s.tool,
        summary: s.summary,
      })),
      ...wellnessResult.steps.map((s) => ({
        agent: "Wellness Agent",
        tool: s.tool,
        summary: s.summary,
      })),
      {
        agent: "Coordinator",
        tool: "synthesize",
        summary: "Synthesized specialist reports into final review",
      },
    ];

    return NextResponse.json({
      ...review,
      agentSteps,
      routingDecision,
      agents: {
        mealAnalyst: { report: mealResult.output.slice(0, 500), toolCalls: mealResult.steps.length, skipped: !hasMealData },
        wellnessAgent: { report: wellnessResult.output.slice(0, 500), toolCalls: wellnessResult.steps.length, mode: hasWearableData ? "full" : "research-only" },
        coordinator: { synthesized: true },
      },
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Weekly review multi-agent error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Weekly review failed" },
      { status: 500 }
    );
  }
}
