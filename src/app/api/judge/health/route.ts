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

export async function GET() {
  const payload = buildJudgeHealthPayload();
  if (payload.features.dynamodbSync === "live") {
    const probeOk = await probeDynamoDB();
    if (!probeOk) {
      payload.features.dynamodbSync = "fallback";
      payload.notes.push("DynamoDB table unreachable (check credentials, region, table exists).");
    }
  }
  return NextResponse.json(payload);
}
