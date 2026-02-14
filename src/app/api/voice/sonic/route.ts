import { NextRequest, NextResponse } from "next/server";
import {
  BedrockRuntimeClient,
  InvokeModelWithBidirectionalStreamCommand,
} from "@aws-sdk/client-bedrock-runtime";
import {
  fixedWindowRateLimit,
  getClientKey,
  getRateLimitHeaderValues,
  getRequestIp,
} from "@/lib/server-rate-limit";
import { z } from "zod";

const NOVA_SONIC = "amazon.nova-sonic-v1:0";
const REGION = process.env.AWS_REGION ?? "us-east-1";

const RICO_VOICE_SYSTEM = `You are Reco, an AI fitness coach for the Recomp app. You're warm, motivating, and genuinely care about the user's progress.
Be concise and conversational — keep responses to 2-3 sentences since this is a voice conversation.
Give practical fitness and nutrition advice. Be encouraging but honest.`;

const MEAL_PARSE_SYSTEM = `You are a nutrition logging assistant. The user will describe a meal they ate.
Parse it into a meal name and estimated macros. Respond conversationally confirming what you heard,
then state the estimated calories, protein, carbs, and fat.`;

function streamEvent(obj: object) {
  return new TextEncoder().encode(JSON.stringify(obj) + "\n");
}

function sanitizeContext(
  context: unknown
): { name?: string; streak?: number; mealsLogged?: number; xp?: number; goal?: string; recentMilestones?: string[] } {
  if (!context || typeof context !== "object") return {};
  const c = context as Record<string, unknown>;
  return {
    name: typeof c.name === "string" ? c.name.slice(0, 80) : undefined,
    streak: typeof c.streak === "number" ? Math.max(0, Math.min(3650, c.streak)) : undefined,
    mealsLogged: typeof c.mealsLogged === "number" ? Math.max(0, Math.min(100000, c.mealsLogged)) : undefined,
    xp: typeof c.xp === "number" ? Math.max(0, Math.min(10_000_000, c.xp)) : undefined,
    goal: typeof c.goal === "string" ? c.goal.slice(0, 60) : undefined,
    recentMilestones: Array.isArray(c.recentMilestones)
      ? c.recentMilestones.filter((v): v is string => typeof v === "string").slice(0, 10)
      : undefined,
  };
}

const VoiceJsonSchema = z.object({
  audioBase64: z.string().min(20).max(20_000_000),
  mode: z.enum(["chat", "meal"]).optional(),
  context: z.unknown().optional(),
  stream: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const rl = fixedWindowRateLimit(getClientKey(getRequestIp(req), "voice-sonic"), 30, 60_000);
    if (!rl.ok) {
      const headers = getRateLimitHeaderValues(rl);
      const res = NextResponse.json({ error: "Rate limit exceeded. Try again shortly." }, { status: 429 });
      res.headers.set("X-RateLimit-Limit", headers.limit);
      res.headers.set("X-RateLimit-Remaining", headers.remaining);
      res.headers.set("X-RateLimit-Reset", headers.reset);
      res.headers.set("Retry-After", headers.retryAfter);
      return res;
    }

    const parsed = VoiceJsonSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid voice request payload" }, { status: 400 });
    }
    const { audioBase64, mode, context, stream: useStream = true } = parsed.data;

    if (!audioBase64 || typeof audioBase64 !== "string" || audioBase64.length < 20) {
      return NextResponse.json({ error: "Audio data required" }, { status: 400 });
    }

    const systemPrompt = mode === "meal" ? MEAL_PARSE_SYSTEM : RICO_VOICE_SYSTEM;
    const safeContext = sanitizeContext(context);
    const contextStr = Object.keys(safeContext).length ? `\n[User context: ${JSON.stringify(safeContext)}]` : "";

    const client = new BedrockRuntimeClient({ region: REGION });
    const promptName = "rico-voice";

    const events = [
      {
        chunk: {
          bytes: new TextEncoder().encode(
            JSON.stringify({
              event: {
                sessionStart: {
                  inferenceConfiguration: {
                    maxTokens: 512,
                    topP: 0.9,
                    temperature: 0.7,
                  },
                },
              },
            })
          ),
        },
      },
      {
        chunk: {
          bytes: new TextEncoder().encode(
            JSON.stringify({
              event: {
                promptStart: {
                  promptName,
                  textOutputConfiguration: { mediaType: "text/plain" },
                  audioOutputConfiguration: {
                    mediaType: "audio/lpcm",
                    sampleRateHertz: 24000,
                    sampleSizeBits: 16,
                    channelCount: 1,
                    voiceId: "tiffany",
                  },
                },
              },
            })
          ),
        },
      },
      {
        chunk: {
          bytes: new TextEncoder().encode(
            JSON.stringify({
              event: {
                contentStart: {
                  promptName,
                  contentName: "systemPrompt",
                  type: "TEXT",
                  interactive: false,
                  role: "system",
                },
              },
            })
          ),
        },
      },
      {
        chunk: {
          bytes: new TextEncoder().encode(
            JSON.stringify({
              event: {
                textInput: {
                  promptName,
                  contentName: "systemPrompt",
                  content: systemPrompt + contextStr,
                },
              },
            })
          ),
        },
      },
      {
        chunk: {
          bytes: new TextEncoder().encode(
            JSON.stringify({
              event: {
                contentEnd: { promptName, contentName: "systemPrompt" },
              },
            })
          ),
        },
      },
      {
        chunk: {
          bytes: new TextEncoder().encode(
            JSON.stringify({
              event: {
                contentStart: {
                  promptName,
                  contentName: "audioInput",
                  type: "AUDIO",
                  interactive: true,
                  role: "user",
                  audioInputConfiguration: {
                    mediaType: "audio/lpcm",
                    sampleRateHertz: 16000,
                    sampleSizeBits: 16,
                    channelCount: 1,
                  },
                },
              },
            })
          ),
        },
      },
      {
        chunk: {
          bytes: new TextEncoder().encode(
            JSON.stringify({
              event: {
                audioInput: {
                  promptName,
                  contentName: "audioInput",
                  content: audioBase64,
                },
              },
            })
          ),
        },
      },
      {
        chunk: {
          bytes: new TextEncoder().encode(
            JSON.stringify({
              event: { contentEnd: { promptName, contentName: "audioInput" } },
            })
          ),
        },
      },
      {
        chunk: {
          bytes: new TextEncoder().encode(
            JSON.stringify({ event: { promptEnd: { promptName } } })
          ),
        },
      },
      {
        chunk: {
          bytes: new TextEncoder().encode(
            JSON.stringify({ event: { sessionEnd: {} } })
          ),
        },
      },
    ];

    async function* inputStream() {
      for (const event of events) yield event;
    }

    const command = new InvokeModelWithBidirectionalStreamCommand({
      modelId: NOVA_SONIC,
      body: inputStream(),
    });

    const response = await client.send(command);

    if (!useStream) {
      let responseText = "";
      const audioChunks: string[] = [];
      if (response.body) {
        for await (const event of response.body) {
          if (event.chunk?.bytes) {
            try {
              const decoded = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
              const ev = decoded.event;
              if (ev?.textOutput) responseText += ev.textOutput.content ?? "";
              if (ev?.audioOutput?.content) audioChunks.push(ev.audioOutput.content);
            } catch {
              /* skip */
            }
          }
        }
      }
      let mealData = null;
      if (mode === "meal" && responseText) {
        const m = responseText.match(/\{[\s\S]*\}/);
        if (m) try { mealData = JSON.parse(m[0]); } catch { /* ignore */ }
      }
      const res = NextResponse.json({
        text: responseText,
        audioBase64: audioChunks.join(""),
        mealData,
      });
      const headers = getRateLimitHeaderValues(rl);
      res.headers.set("X-RateLimit-Limit", headers.limit);
      res.headers.set("X-RateLimit-Remaining", headers.remaining);
      res.headers.set("X-RateLimit-Reset", headers.reset);
      return res;
    }

    const stream = new ReadableStream({
      async start(controller) {
        let responseText = "";
        const audioChunks: string[] = [];
        try {
          if (response.body) {
            for await (const event of response.body) {
              if (event.chunk?.bytes) {
                try {
                  const decoded = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
                  const ev = decoded.event;
                  if (ev?.textOutput) {
                    const delta = ev.textOutput.content ?? "";
                    responseText += delta;
                    controller.enqueue(streamEvent({ type: "text", content: delta }));
                  }
                  if (ev?.audioOutput?.content) {
                    audioChunks.push(ev.audioOutput.content);
                    controller.enqueue(streamEvent({ type: "audio", content: ev.audioOutput.content }));
                  }
                } catch {
                  /* skip */
                }
              }
            }
          }
          let mealData = null;
          if (mode === "meal" && responseText) {
            const m = responseText.match(/\{[\s\S]*\}/);
            if (m) try { mealData = JSON.parse(m[0]); } catch { /* ignore */ }
          }
          controller.enqueue(streamEvent({ type: "done", text: responseText, mealData }));
        } catch (e) {
          controller.enqueue(streamEvent({ type: "error", error: String(e) }));
        } finally {
          controller.close();
        }
      },
    });

    const streamed = new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
    const headers = getRateLimitHeaderValues(rl);
    streamed.headers.set("X-RateLimit-Limit", headers.limit);
    streamed.headers.set("X-RateLimit-Remaining", headers.remaining);
    streamed.headers.set("X-RateLimit-Reset", headers.reset);
    return streamed;
  } catch (err) {
    console.error("Nova Sonic error:", err);
    try {
      const { invokeNova } = await import("@/lib/nova");
      const body = await req.clone().json();
      const { mode, context } = body;
      const systemPrompt = mode === "meal"
        ? "Parse the described meal into name and macros. Respond naturally."
        : "You are Reco, a warm AI fitness coach. Be concise.";
      const reply = await invokeNova(
        systemPrompt,
        `[Context: ${JSON.stringify(context ?? {})}] The user sent a voice message. Since audio processing failed, respond with a helpful text message acknowledging you heard them and ask them to try text input instead.`,
        { temperature: 0.7, maxTokens: 256 }
      );
      return NextResponse.json({
        text: reply,
        audioBase64: "",
        fallback: true,
      });
    } catch (fallbackErr) {
      console.error("Sonic fallback error:", fallbackErr);
      return NextResponse.json(
        { error: "Voice processing failed. Nova Sonic may not be available in this region." },
        { status: 500 }
      );
    }
  }
}
