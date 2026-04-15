import { NextResponse } from "next/server";
import { DynamoDBClient, DescribeTableCommand } from "@aws-sdk/client-dynamodb";
import { buildJudgeHealthPayload } from "@/lib/judgeMode";

async function probeDynamoDB(): Promise<boolean> {
  const table = process.env.DYNAMODB_TABLE_NAME;
  const region = process.env.AWS_REGION ?? "us-east-1";
  if (!table || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) return false;
  try {
    const client = new DynamoDBClient({ region });
    await client.send(new DescribeTableCommand({ TableName: table }));
    return true;
  } catch {
    return false;
  }
}

async function probeActService(): Promise<{ configured: boolean; reachable: boolean; url: string | null }> {
  let base = (process.env.ACT_SERVICE_URL ?? "").trim().replace(/\/$/, "");
  if (!base) return { configured: false, reachable: false, url: null };
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
  try {
    const res = await fetch(`${base}/health`, { method: "GET", signal: AbortSignal.timeout(5000) });
    return { configured: true, reachable: res.ok, url: base };
  } catch {
    return { configured: true, reachable: false, url: base };
  }
}

export async function GET() {
  const payload = buildJudgeHealthPayload();

  // Probe DynamoDB
  if (payload.features.dynamodbSync === "live") {
    const probeOk = await probeDynamoDB();
    if (!probeOk) {
      payload.features.dynamodbSync = "fallback";
      payload.notes.push("DynamoDB table unreachable (check credentials, region, table exists).");
    }
  }

  // Probe Act service
  const actProbe = await probeActService();
  if (actProbe.configured && !actProbe.reachable) {
    payload.features.actGrocery = "fallback";
    payload.features.actNutrition = "fallback";
    payload.notes.push(`Act service configured (${actProbe.url}) but unreachable. Grocery/nutrition will use demo fallback.`);
  } else if (!actProbe.configured && payload.features.actGrocery !== "fallback") {
    payload.notes.push("Act service not configured (ACT_SERVICE_URL not set). Grocery/nutrition use demo fallback.");
  }

  return NextResponse.json({
    ...payload,
    probes: {
      actService: actProbe,
    },
  });
}
