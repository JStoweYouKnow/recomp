import {
  BedrockRuntimeClient,
  ConverseCommand,
  InvokeModelCommand,
  StartAsyncInvokeCommand,
  GetAsyncInvokeCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { recordJudgeTrace } from "@/lib/judgeTrace";

const NOVA_LITE_DEFAULT = "amazon.nova-2-lite-v1:0";
/** Nova Lite model ID or inference profile ARN — respects BEDROCK_NOVA_LITE_MODEL_ID env */
export const NOVA_LITE_MODEL_ID =
  process.env.BEDROCK_NOVA_LITE_MODEL_ID ??
  process.env.NOVA_LITE_MODEL_ID ??
  process.env.BEDROCK_NOVA_LITE_INFERENCE_PROFILE_ARN ??
  NOVA_LITE_DEFAULT;
const NOVA_LITE = NOVA_LITE_MODEL_ID;
/** Web Grounding requires US CRIS profile per AWS docs. Override with BEDROCK_NOVA_WEB_GROUNDING_MODEL_ID if needed. */
const NOVA_WEB_GROUNDING_MODEL =
  process.env.BEDROCK_NOVA_WEB_GROUNDING_MODEL_ID ?? "us.amazon.nova-2-lite-v1:0";
/** Claude 3.5 Haiku via Bedrock — strong built-in nutrition knowledge, used as LLM fallback */
const CLAUDE_HAIKU_MODEL =
  process.env.BEDROCK_CLAUDE_HAIKU_MODEL_ID ?? "anthropic.claude-3-5-haiku-20241022-v1:0";
/** Llama 3 70B via Bedrock — final LLM fallback before Nova Lite */
const LLAMA_MODEL =
  process.env.BEDROCK_LLAMA_MODEL_ID ?? "meta.llama3-70b-instruct-v1:0";
const NOVA_CANVAS = process.env.BEDROCK_NOVA_CANVAS_MODEL_ID ?? "amazon.nova-canvas-v1:0";
const NOVA_REEL = process.env.BEDROCK_NOVA_REEL_MODEL_ID ?? "amazon.nova-reel-v1:1";
const REGION = process.env.AWS_REGION ?? "us-east-1";
/** Read timeout for web grounding (ms). Nova can take longer; default 2 min. */
const WEB_GROUNDING_READ_TIMEOUT_MS = Number(
  process.env.NOVA_WEB_GROUNDING_READ_TIMEOUT_MS ?? 120_000
);

function getClient() {
  return new BedrockRuntimeClient({ region: REGION });
}

/** Client with extended read timeout for web grounding (can take longer) */
function getWebGroundingClient() {
  try {
    return new BedrockRuntimeClient({
      region: REGION,
      requestHandler: new NodeHttpHandler({
        requestTimeout: WEB_GROUNDING_READ_TIMEOUT_MS,
      }),
    });
  } catch {
    // NodeHttpHandler may fail in edge/serverless bundles; fall back to default client
    console.warn("NodeHttpHandler unavailable, using default Bedrock client for web grounding");
    return new BedrockRuntimeClient({ region: REGION });
  }
}

function withInferenceProfileHint(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("on-demand throughput isn’t supported") || message.includes("on-demand throughput isn't supported")) {
    throw new Error(
      `Bedrock rejected on-demand access for ${NOVA_LITE_DEFAULT}. ` +
      `Set BEDROCK_NOVA_LITE_MODEL_ID to your Nova Lite inference profile ID/ARN, ` +
      `then restart the server. Current value: ${NOVA_LITE}.`
    );
  }
  throw (err instanceof Error ? err : new Error(message));
}

function traceNovaCall(args: {
  action: string;
  service: string;
  model?: string;
  startedAt: number;
  status: "ok" | "error" | "fallback";
  detail?: string;
}) {
  recordJudgeTrace({
    action: args.action,
    service: args.service,
    model: args.model,
    status: args.status,
    durationMs: Date.now() - args.startedAt,
    detail: args.detail,
  });
}

/** Basic text inference with Nova 2 Lite */
export async function invokeNova(
  systemPrompt: string,
  userMessage: string,
  options?: { temperature?: number; maxTokens?: number }
): Promise<string> {
  const startedAt = Date.now();
  const client = getClient();
  const input = {
    modelId: NOVA_LITE,
    messages: [{ role: "user" as const, content: [{ text: userMessage }] }],
    system: [{ text: systemPrompt }],
    inferenceConfig: {
      temperature: options?.temperature ?? 0.7,
      maxTokens: options?.maxTokens ?? 4096,
      topP: 0.9,
    },
  };
  try {
    const response = await client.send(new ConverseCommand(input));
    const content = response.output?.message?.content ?? [];
    const textBlock = content.find((c: { text?: string }) => "text" in c);
    traceNovaCall({
      action: "invokeNova",
      service: "bedrock-converse",
      model: NOVA_LITE,
      startedAt,
      status: "ok",
    });
    return (textBlock as { text: string })?.text ?? "";
  } catch (err) {
    traceNovaCall({
      action: "invokeNova",
      service: "bedrock-converse",
      model: NOVA_LITE,
      startedAt,
      status: "error",
      detail: err instanceof Error ? err.message : String(err),
    });
    withInferenceProfileHint(err);
  }
}

/** Nova 2 Lite with image input (meal photo analysis) */
export async function invokeNovaWithImage(
  systemPrompt: string,
  userMessage: string,
  imageBase64: string,
  imageFormat: "png" | "jpeg" | "gif" | "webp" = "jpeg"
): Promise<string> {
  const startedAt = Date.now();
  const client = getClient();
  const imageBytes = Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ""), "base64");
  const input = {
    modelId: NOVA_LITE,
    messages: [
      {
        role: "user" as const,
        content: [
          { text: userMessage },
          {
            image: {
              format: imageFormat,
              source: { bytes: new Uint8Array(imageBytes) },
            },
          },
        ],
      },
    ],
    system: [{ text: systemPrompt }],
    inferenceConfig: { temperature: 0.5, maxTokens: 1024, topP: 0.9 },
  };
  try {
    const response = await client.send(new ConverseCommand(input));
    const content = response.output?.message?.content ?? [];
    const textBlock = content.find((c: { text?: string }) => "text" in c);
    traceNovaCall({
      action: "invokeNovaWithImage",
      service: "bedrock-converse",
      model: NOVA_LITE,
      startedAt,
      status: "ok",
    });
    return (textBlock as { text: string })?.text ?? "";
  } catch (err) {
    traceNovaCall({
      action: "invokeNovaWithImage",
      service: "bedrock-converse",
      model: NOVA_LITE,
      startedAt,
      status: "error",
      detail: err instanceof Error ? err.message : String(err),
    });
    withInferenceProfileHint(err);
  }
}

/** Nova 2 Lite with web grounding (current guidelines).
 *  Requires: (1) US CRIS profile (us.amazon.nova-2-lite-v1:0), (2) bedrock:InvokeTool on arn:aws:bedrock::{account}:system-tool/amazon.nova_grounding */
export async function invokeNovaWithWebGrounding(
  systemPrompt: string,
  userMessage: string,
  options?: { temperature?: number; maxTokens?: number }
): Promise<string> {
  const startedAt = Date.now();
  const client = getWebGroundingClient();
  const input = {
    modelId: NOVA_WEB_GROUNDING_MODEL,
    messages: [{ role: "user" as const, content: [{ text: userMessage }] }],
    system: [{ text: systemPrompt }],
    toolConfig: { tools: [{ systemTool: { name: "nova_grounding" } }] },
    inferenceConfig: {
      temperature: options?.temperature ?? 0.6,
      maxTokens: options?.maxTokens ?? 8192,
      topP: 0.9,
    },
  };
  try {
    const response = await client.send(new ConverseCommand(input));
    const content = response.output?.message?.content ?? [];
    let result = "";
    for (const block of content) {
      if ("text" in block) result += (block as { text: string }).text;
      if ("citationsContent" in block) {
        const cc = block as { citationsContent?: { citations?: { location?: { web?: { url?: string } } }[] } };
        const citations = cc.citationsContent?.citations ?? [];
        for (const cit of citations) {
          const url = cit.location?.web?.url;
          if (url) result += ` [${url}]`;
        }
      }
    }
    traceNovaCall({
      action: "invokeNovaWithWebGrounding",
      service: "bedrock-converse",
      model: NOVA_WEB_GROUNDING_MODEL,
      startedAt,
      status: "ok",
    });
    return result || "No response";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Log the actual error for debugging before re-throwing
    console.error(`Web grounding failed (model=${NOVA_WEB_GROUNDING_MODEL}, region=${REGION}):`, message);
    traceNovaCall({
      action: "invokeNovaWithWebGrounding",
      service: "bedrock-converse",
      model: NOVA_WEB_GROUNDING_MODEL,
      startedAt,
      status: "error",
      detail: message,
    });
    withInferenceProfileHint(err);
  }
}

/** Claude 3.5 Haiku via Bedrock Converse — strong built-in nutrition & food knowledge */
async function invokeClaudeHaiku(
  systemPrompt: string,
  userMessage: string,
  options?: { temperature?: number; maxTokens?: number }
): Promise<string> {
  const client = getClient();
  const response = await client.send(
    new ConverseCommand({
      modelId: CLAUDE_HAIKU_MODEL,
      messages: [{ role: "user" as const, content: [{ text: userMessage }] }],
      system: [{ text: systemPrompt }],
      inferenceConfig: {
        temperature: options?.temperature ?? 0.3,
        maxTokens: options?.maxTokens ?? 512,
      },
    })
  );
  const content = response.output?.message?.content ?? [];
  const textBlock = content.find((c: { text?: string }) => "text" in c);
  return (textBlock as { text: string })?.text ?? "";
}

/** Llama 3 70B via Bedrock Converse */
async function invokeLlama(
  systemPrompt: string,
  userMessage: string,
  options?: { temperature?: number; maxTokens?: number }
): Promise<string> {
  const client = getClient();
  const response = await client.send(
    new ConverseCommand({
      modelId: LLAMA_MODEL,
      messages: [{ role: "user" as const, content: [{ text: userMessage }] }],
      system: [{ text: systemPrompt }],
      inferenceConfig: {
        temperature: options?.temperature ?? 0.3,
        maxTokens: options?.maxTokens ?? 512,
      },
    })
  );
  const content = response.output?.message?.content ?? [];
  const textBlock = content.find((c: { text?: string }) => "text" in c);
  return (textBlock as { text: string })?.text ?? "";
}

type NutritionLookupSource = "web-grounding" | "claude-haiku" | "llama" | "nova-lite";

/** Web grounding with automatic fallback chain:
 *  Nova web grounding → Claude 3.5 Haiku → Llama 3 70B → Nova Lite */
export async function invokeNovaWithWebGroundingOrFallback(
  systemPrompt: string,
  userMessage: string,
  options?: { temperature?: number; maxTokens?: number }
): Promise<{ text: string; source: NutritionLookupSource }> {
  const startedAt = Date.now();

  // 1. Nova web grounding (has live web access)
  try {
    const text = await invokeNovaWithWebGrounding(systemPrompt, userMessage, options);
    traceNovaCall({
      action: "invokeNovaWithWebGroundingOrFallback",
      service: "bedrock-converse",
      model: NOVA_WEB_GROUNDING_MODEL,
      startedAt,
      status: "ok",
      detail: "source=web-grounding",
    });
    return { text, source: "web-grounding" };
  } catch (err) {
    console.warn("Web grounding unavailable, trying Claude Haiku:", err instanceof Error ? err.message : err);
  }

  // 2. Claude 3.5 Haiku — excellent built-in nutrition knowledge
  try {
    const text = await invokeClaudeHaiku(systemPrompt, userMessage, options);
    traceNovaCall({
      action: "invokeNovaWithWebGroundingOrFallback",
      service: "bedrock-converse",
      model: CLAUDE_HAIKU_MODEL,
      startedAt,
      status: "fallback",
      detail: "source=claude-haiku",
    });
    return { text, source: "claude-haiku" };
  } catch (err) {
    console.warn("Claude Haiku unavailable, trying Llama:", err instanceof Error ? err.message : err);
  }

  // 3. Llama 3 70B
  try {
    const text = await invokeLlama(systemPrompt, userMessage, options);
    traceNovaCall({
      action: "invokeNovaWithWebGroundingOrFallback",
      service: "bedrock-converse",
      model: LLAMA_MODEL,
      startedAt,
      status: "fallback",
      detail: "source=llama",
    });
    return { text, source: "llama" };
  } catch (err) {
    console.warn("Llama unavailable, falling back to Nova Lite:", err instanceof Error ? err.message : err);
  }

  // 4. Nova Lite — last resort
  const text = await invokeNova(systemPrompt, userMessage, options);
  traceNovaCall({
    action: "invokeNovaWithWebGroundingOrFallback",
    service: "bedrock-converse",
    model: NOVA_LITE,
    startedAt,
    status: "fallback",
    detail: "source=nova-lite",
  });
  return { text, source: "nova-lite" };
}

/** Nova 2 Lite with extended thinking for complex reasoning */
export async function invokeNovaWithExtendedThinking(
  systemPrompt: string,
  userMessage: string,
  effort: "low" | "medium" | "high" = "high",
  options?: { maxTokens?: number; temperature?: number }
): Promise<string> {
  const startedAt = Date.now();
  const client = getClient();
  const input: {
    modelId: string;
    messages: { role: "user"; content: { text: string }[] }[];
    system: { text: string }[];
    additionalModelRequestFields: { reasoningConfig: { type: "enabled"; maxReasoningEffort: "low" | "medium" | "high" } };
    inferenceConfig?: { temperature: number; maxTokens: number; topP: number };
  } = {
    modelId: NOVA_LITE,
    messages: [{ role: "user" as const, content: [{ text: userMessage }] }],
    system: [{ text: systemPrompt }],
    additionalModelRequestFields: {
      reasoningConfig: { type: "enabled", maxReasoningEffort: effort },
    },
  };

  // Bedrock/Nova rejects temperature/topP/maxTokens when reasoning effort is high.
  if (effort !== "high") {
    input.inferenceConfig = {
      temperature: options?.temperature ?? 0.6,
      maxTokens: options?.maxTokens ?? 8192,
      topP: 0.9,
    };
  }
  try {
    const response = await client.send(new ConverseCommand(input));
    const content = response.output?.message?.content ?? [];
    const textBlock = content.find((c: { text?: string }) => "text" in c);
    traceNovaCall({
      action: "invokeNovaWithExtendedThinking",
      service: "bedrock-converse",
      model: NOVA_LITE,
      startedAt,
      status: "ok",
      detail: `effort=${effort}`,
    });
    return (textBlock as { text: string })?.text ?? "";
  } catch (err) {
    traceNovaCall({
      action: "invokeNovaWithExtendedThinking",
      service: "bedrock-converse",
      model: NOVA_LITE,
      startedAt,
      status: "error",
      detail: err instanceof Error ? err.message : String(err),
    });
    withInferenceProfileHint(err);
  }
}

/** Nova Canvas – generate image from text */
export async function invokeNovaCanvas(prompt: string, width = 512, height = 512): Promise<string> {
  const startedAt = Date.now();
  const client = getClient();
  const payload = {
    taskType: "TEXT_IMAGE",
    textToImageParams: { text: prompt },
    imageGenerationConfig: {
      seed: Math.floor(Math.random() * 858993460),
      quality: "standard",
      width,
      height,
      numberOfImages: 1,
    },
  };
  const response = await client.send(
    new InvokeModelCommand({
      modelId: NOVA_CANVAS,
      body: JSON.stringify(payload),
      contentType: "application/json",
    })
  );
  const body = JSON.parse(new TextDecoder().decode(response.body));
  traceNovaCall({
    action: "invokeNovaCanvas",
    service: "bedrock-invoke-model",
    model: NOVA_CANVAS,
    startedAt,
    status: "ok",
  });
  return body.images?.[0] ?? "";
}

/** Nova Reel – start async video generation (requires S3 bucket) */
export async function startNovaReelVideo(
  prompt: string,
  s3OutputUri: string
): Promise<{ invocationArn: string }> {
  const startedAt = Date.now();
  const client = getClient();
  const modelInput = {
    taskType: "TEXT_VIDEO",
    textToVideoParams: { text: prompt.slice(0, 512) },
    videoGenerationConfig: {
      durationSeconds: 6,
      fps: 24,
      dimension: "1280x720",
      seed: Math.floor(Math.random() * 2147483647),
    },
  };
  const response = await client.send(
    new StartAsyncInvokeCommand({
      modelId: NOVA_REEL,
      modelInput: modelInput,
      outputDataConfig: { s3OutputDataConfig: { s3Uri: s3OutputUri } },
    })
  );
  traceNovaCall({
    action: "startNovaReelVideo",
    service: "bedrock-start-async",
    model: NOVA_REEL,
    startedAt,
    status: "ok",
  });
  return { invocationArn: response.invocationArn ?? "" };
}

/** Poll Nova Reel async job status */
export async function getNovaReelStatus(
  invocationArn: string
): Promise<{ status: string; outputLocation?: string; failureMessage?: string }> {
  const startedAt = Date.now();
  const client = getClient();
  const response = await client.send(new GetAsyncInvokeCommand({ invocationArn }));
  traceNovaCall({
    action: "getNovaReelStatus",
    service: "bedrock-get-async",
    model: NOVA_REEL,
    startedAt,
    status: response.failureMessage ? "error" : "ok",
    detail: response.status,
  });
  return {
    status: response.status ?? "Unknown",
    outputLocation: response.outputDataConfig?.s3OutputDataConfig?.s3Uri,
    failureMessage: response.failureMessage,
  };
}
