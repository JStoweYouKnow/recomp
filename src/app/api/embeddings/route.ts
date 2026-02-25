import { NextRequest, NextResponse } from "next/server";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { getUserId } from "@/lib/auth";
import { fixedWindowRateLimit, getClientKey, getRequestIp } from "@/lib/server-rate-limit";
import { requireAuthForAI } from "@/lib/judgeMode";

const EMBEDDINGS_MODEL = "amazon.nova-2-multimodal-embeddings-v1:0";
const REGION = process.env.AWS_REGION ?? "us-east-1";

export async function POST(req: NextRequest) {
  const rl = fixedWindowRateLimit(getClientKey(getRequestIp(req), "embeddings"), 15, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  if (requireAuthForAI()) {
    const userId = await getUserId(req.headers);
    if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { text, imageBase64 } = body;

    const client = new BedrockRuntimeClient({ region: REGION });

    let requestBody: Record<string, unknown>;
    if (imageBase64) {
      const b64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      requestBody = {
        taskType: "SINGLE_EMBEDDING",
        singleEmbeddingParams: {
          embeddingPurpose: "GENERIC_INDEX",
          embeddingDimension: 1024,
          image: {
            format: "jpeg",
            source: { bytes: b64 },
          },
        },
      };
    } else {
      requestBody = {
        taskType: "SINGLE_EMBEDDING",
        singleEmbeddingParams: {
          embeddingPurpose: "GENERIC_INDEX",
          embeddingDimension: 1024,
          text: { truncationMode: "END", value: text || "" },
        },
      };
    }

    const response = await client.send(
      new InvokeModelCommand({
        modelId: EMBEDDINGS_MODEL,
        body: JSON.stringify(requestBody),
        contentType: "application/json",
      })
    );
    const result = JSON.parse(new TextDecoder().decode(response.body));
    const embedding = result.embedding ?? result.embeddings?.[0];
    return NextResponse.json({ embedding });
  } catch (err) {
    console.error("Embeddings error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Embedding failed" },
      { status: 500 }
    );
  }
}
