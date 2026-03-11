import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { BedrockRuntimeClient, ConverseCommand, type Message, type ToolConfiguration } from "@aws-sdk/client-bedrock-runtime";
import { NOVA_LITE_MODEL_ID } from "@/lib/nova";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { requireAuthForAI } from "@/lib/judgeMode";
import { logInfo, logError } from "@/lib/logger";

const REGION = process.env.AWS_REGION ?? "us-east-1";

const RICO_SYSTEM = `You are Reco, an AI fitness coach for the Recomp app. You're warm, motivating, and genuinely care about the user's progress.

PERSONALITY:
- Supportive and encouraging – celebrate wins, big or small
- Practical – give concrete, actionable advice
- Occasionally stern when needed – if the user has been slacking (missed logs, broken streaks, excuses), give a firm but caring wake-up call. Don't be mean, but don't enable avoidance either.
- Use their name when you know it
- Keep responses concise (2-4 sentences usually). Be punchy.
- Never lecture. Be conversational.

CONTEXT YOU RECEIVE:
The user's message plus optional context about: streak length, meals logged, XP, recent milestones, goal, current macros, and whether they've been inconsistent lately.

You have access to tools! You are an AGENT, not just a chatbot.
1. If the user asks to change their calorie or macro targets, use the 'update_macros' tool.
2. If the user tells you they ate something and wants to log it, estimate the macros and use the 'log_meal' tool.
Always confirm to the user what you just did when using a tool (e.g. "I've updated your macros to 2000 calories!").

Respond as Reco. No markdown. No bullet lists unless it's 2-3 quick tips. Be human.`;

const PERSONA_PROMPTS: Record<string, string> = {
  motivator: `\n\nSTYLE OVERRIDE: You are in HYPE MODE. Be extremely enthusiastic! Use exclamations! Celebrate EVERYTHING! Every meal logged is a WIN. Every macro hit is LEGENDARY. Pump the user up like they just scored the winning touchdown. Energy should be 11/10.`,
  scientist: `\n\nSTYLE OVERRIDE: You are in DATA MODE. Be analytical and precise. Reference research when relevant. Use numbers, percentages, and specific measurements. Say things like "Studies show..." and "Based on your data..." Be the nerdy coach who backs everything with evidence. Still be personable, not robotic.`,
  tough_love: `\n\nSTYLE OVERRIDE: You are in DRILL SERGEANT MODE. No excuses. Be direct, blunt, and unapologetically honest. If they missed a meal, call it out. If they're making excuses, shut it down. Short sentences. Commanding. Think tough love from someone who genuinely cares but won't coddle. Never be cruel, just relentlessly honest.`,
  chill_friend: `\n\nSTYLE OVERRIDE: You are in CHILL MODE. Be relaxed, casual, and laid-back. Use conversational slang. Keep it light and breezy. You're the friend who happens to know about fitness. Say things like "no worries", "you got this", "honestly not a big deal". Never stress the user out. Vibe check: immaculate.`,
};

function getHolidayContext(): string {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();

  if (month === 1 && day === 1) return "\n\n[It's New Year's Day! Be extra motivating about fresh starts and new goals.]";
  if (month === 2 && day === 14) return "\n\n[It's Valentine's Day! Work in some self-love and body-positivity messaging.]";
  if (month === 4 && day === 1) return "\n\n[It's April Fools! Be extra playful and witty. Sneak in one fitness joke.]";
  if (month === 10 && day === 31) return "\n\n[It's Halloween! Be spooky-fun. Maybe warn about candy macros with humor.]";
  if (month === 11 && day >= 22 && day <= 28) return "\n\n[It's Thanksgiving week! Acknowledge that holiday eating is normal. No guilt trips.]";
  if (month === 12 && day >= 24 && day <= 26) return "\n\n[It's the holidays! Be festive and encouraging. Rest days are earned.]";
  return "";
}

const RICO_TOOLS: ToolConfiguration = {
  tools: [
    {
      toolSpec: {
        name: "update_macros",
        description: "Updates the user's daily macronutrient targets based on their goals.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              calories: { type: "number", description: "Daily calorie target" },
              protein: { type: "number", description: "Daily protein target in grams" },
              carbs: { type: "number", description: "Daily carbs target in grams" },
              fat: { type: "number", description: "Daily fat target in grams" }
            },
            required: ["calories", "protein", "carbs", "fat"]
          }
        }
      }
    },
    {
      toolSpec: {
        name: "log_meal",
        description: "Logs a food item or meal directly into the user's food diary.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              name: { type: "string", description: "Name of the meal/food" },
              calories: { type: "number" },
              protein: { type: "number" },
              carbs: { type: "number" },
              fat: { type: "number" }
            },
            required: ["name", "calories", "protein", "carbs", "fat"]
          }
        }
      }
    }
  ]
};

export async function POST(req: NextRequest) {
  const rl = await fixedWindowRateLimit(getClientKey(getRequestIp(req), "rico"), 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  if (requireAuthForAI()) {
    const userId = await getUserId(req.headers);
    if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    const { message, context, persona } = await req.json();
    const msg = typeof message === "string" ? message : "";
    if (!msg.trim()) return NextResponse.json({ error: "Message required" }, { status: 400 });

    const ctx = context ?? {};
    const userPrompt = `[Context: ${JSON.stringify(ctx)}]\n\nUser: ${msg}`;

    let systemPrompt = RICO_SYSTEM;
    if (persona && PERSONA_PROMPTS[persona]) {
      systemPrompt += PERSONA_PROMPTS[persona];
    }
    systemPrompt += getHolidayContext();

    const client = new BedrockRuntimeClient({ region: REGION });
    const messages: Message[] = [{ role: "user", content: [{ text: userPrompt }] }];

    const command = new ConverseCommand({
      modelId: NOVA_LITE_MODEL_ID,
      messages,
      system: [{ text: systemPrompt }],
      toolConfig: RICO_TOOLS,
      inferenceConfig: { temperature: 0.7, maxTokens: 512, topP: 0.9 },
    });

    const response = await client.send(command);
    const output = response.output?.message;
    
    if (!output || !output.content) {
      throw new Error("Empty response from Bedrock");
    }

    let replyText = "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const actions: any[] = [];

    // Parse blocks for text and tool uses
    for (const block of output.content) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((block as any).text) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        replyText += (block as any).text;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((block as any).toolUse) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const t = (block as any).toolUse;
        actions.push({ type: t.name, payload: t.input });
      }
    }

    // In a multi-turn agent we would send the tool result back to the model.
    // However, since we want the client to execute the action locally (to update localStorage/state instantly), 
    // we return the action to the client directly. Often the model will include text explaining what it did.
    // If it *only* returned a tool call (no text), we supply a default reply.
    if (!replyText && actions.length > 0) {
      if (actions[0].type === "update_macros") replyText = "I've updated your daily targets!";
      if (actions[0].type === "log_meal") replyText = `I've logged ${actions[0].payload.name} for you.`;
    }

    logInfo("Rico chat reply", { route: "rico", persona: persona || "default", actions: actions.length });
    return NextResponse.json({ reply: replyText.trim(), actions });
  } catch (err) {
    logError("Rico chat failed", err, { route: "rico" });
    return NextResponse.json({ error: "Reco is taking a breather. Try again." }, { status: 500 });
  }
}
