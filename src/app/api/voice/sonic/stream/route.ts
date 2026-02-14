import { NextRequest } from "next/server";
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

function encodeBedrockEvent(obj: object) {
  return { chunk: { bytes: new TextEncoder().encode(JSON.stringify(obj)) } };
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

const StreamConfigSchema = z.object({
  type: z.literal("config"),
  mode: z.enum(["chat", "meal"]).optional(),
  context: z.unknown().optional(),
});

/** Parse NDJSON lines from a ReadableStream */
async function* readNdjsonStream(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        yield JSON.parse(line) as { type: string; mode?: string; context?: object; content?: string; error?: string };
      } catch {
        /* skip malformed */
      }
    }
  }
  if (buffer.trim()) {
    try {
      yield JSON.parse(buffer) as { type: string; mode?: string; context?: object; content?: string; error?: string };
    } catch {
      /* ignore */
    }
  }
}

/** Build Bedrock input stream from client audio chunks */
async function* buildBedrockInput(
  mode: string,
  contextStr: string,
  clientStream: AsyncGenerator<{ type: string; content?: string; error?: string }>
) {
  const promptName = "rico-voice";
  const systemPrompt = mode === "meal" ? MEAL_PARSE_SYSTEM : RICO_VOICE_SYSTEM;

  yield encodeBedrockEvent({
    event: {
      sessionStart: {
        inferenceConfiguration: { maxTokens: 512, topP: 0.9, temperature: 0.7 },
      },
    },
  });
  yield encodeBedrockEvent({
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
  });
  yield encodeBedrockEvent({
    event: {
      contentStart: { promptName, contentName: "systemPrompt", type: "TEXT", interactive: false, role: "system" },
    },
  });
  yield encodeBedrockEvent({
    event: { textInput: { promptName, contentName: "systemPrompt", content: systemPrompt + contextStr } },
  });
  yield encodeBedrockEvent({
    event: { contentEnd: { promptName, contentName: "systemPrompt" } },
  });
  yield encodeBedrockEvent({
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
  });

  let hasAudio = false;
  for await (const msg of clientStream) {
    if (msg.type === "error") throw new Error(msg.error ?? "Stream error");
    if (msg.type === "audio" && msg.content) {
      hasAudio = true;
      yield encodeBedrockEvent({
        event: { audioInput: { promptName, contentName: "audioInput", content: msg.content } },
      });
    }
  }
  if (!hasAudio) {
    throw new Error("No audio provided");
  }

  yield encodeBedrockEvent({ event: { contentEnd: { promptName, contentName: "audioInput" } } });
  yield encodeBedrockEvent({ event: { promptEnd: { promptName } } });
  yield encodeBedrockEvent({ event: { sessionEnd: {} } });
}

export async function POST(req: NextRequest) {
  const rl = fixedWindowRateLimit(getClientKey(getRequestIp(req), "voice-sonic-stream"), 30, 60_000);
  if (!rl.ok) {
    const headers = getRateLimitHeaderValues(rl);
    const res = new Response(JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
    res.headers.set("X-RateLimit-Limit", headers.limit);
    res.headers.set("X-RateLimit-Remaining", headers.remaining);
    res.headers.set("X-RateLimit-Reset", headers.reset);
    res.headers.set("Retry-After", headers.retryAfter);
    return res;
  }
  if (!req.body) {
    return new Response(JSON.stringify({ error: "Streaming body required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const client = new BedrockRuntimeClient({ region: REGION });
  let mode = "chat";
  let contextStr = "";

  try {
    const clientMessages = readNdjsonStream(req.body);
    const first = await clientMessages.next();
    if (first.done || !first.value) {
      return new Response(JSON.stringify({ error: "Expected config message first" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    const config = first.value;
    if (config.type === "config") {
      const cfgParsed = StreamConfigSchema.safeParse(config);
      if (!cfgParsed.success) {
        return new Response(JSON.stringify({ error: "Invalid stream config payload" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      mode = cfgParsed.data.mode ?? "chat";
      const safeContext = sanitizeContext(cfgParsed.data.context);
      contextStr = Object.keys(safeContext).length
        ? `\n[User context: ${JSON.stringify(safeContext)}]`
        : "";
    } else if (config.type === "error") {
      return new Response(JSON.stringify({ error: config.error ?? "Stream error" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const bedrockInput = buildBedrockInput(mode, contextStr, clientMessages);
    const command = new InvokeModelWithBidirectionalStreamCommand({
      modelId: NOVA_SONIC,
      body: bedrockInput,
    });

    const response = await client.send(command);

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
          let mealData: object | null = null;
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
    console.error("Nova Sonic stream error:", err);
    if (err instanceof Error && err.message.includes("No audio provided")) {
      return new Response(JSON.stringify({ error: "No audio detected. Please hold to record and try again." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(
      JSON.stringify({ error: "Voice streaming failed. Nova Sonic may not be available." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
