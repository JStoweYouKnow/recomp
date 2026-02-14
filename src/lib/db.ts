import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  DeleteCommand,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import type {
  UserProfile,
  FitnessPlan,
  MealEntry,
  WearableConnection,
  WearableDaySummary,
  Milestone,
  RicoMessage,
  WeeklyReview,
} from "./types";

const TABLE = process.env.DYNAMODB_TABLE_NAME ?? "RecompTable";
const REGION = process.env.AWS_REGION ?? "us-east-1";

function getDocClient() {
  const client = new DynamoDBClient({ region: REGION });
  return DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
  });
}

// ── Profile ──────────────────────────────────────────────
export async function dbGetProfile(userId: string): Promise<UserProfile | null> {
  const doc = getDocClient();
  const { Item } = await doc.send(
    new GetCommand({ TableName: TABLE, Key: { PK: `USER#${userId}`, SK: "PROFILE" } })
  );
  return Item ? (Item.data as UserProfile) : null;
}

export async function dbSaveProfile(userId: string, profile: UserProfile): Promise<void> {
  const doc = getDocClient();
  await doc.send(
    new PutCommand({
      TableName: TABLE,
      Item: { PK: `USER#${userId}`, SK: "PROFILE", data: profile, updatedAt: new Date().toISOString() },
    })
  );
}

// ── Plan ─────────────────────────────────────────────────
export async function dbGetPlan(userId: string): Promise<FitnessPlan | null> {
  const doc = getDocClient();
  const { Item } = await doc.send(
    new GetCommand({ TableName: TABLE, Key: { PK: `USER#${userId}`, SK: "PLAN" } })
  );
  return Item ? (Item.data as FitnessPlan) : null;
}

export async function dbSavePlan(userId: string, plan: FitnessPlan): Promise<void> {
  const doc = getDocClient();
  await doc.send(
    new PutCommand({
      TableName: TABLE,
      Item: { PK: `USER#${userId}`, SK: "PLAN", data: plan, updatedAt: new Date().toISOString() },
    })
  );
}

// ── Meals ────────────────────────────────────────────────
export async function dbGetMeals(userId: string): Promise<MealEntry[]> {
  const doc = getDocClient();
  const { Items } = await doc.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: { ":pk": `USER#${userId}`, ":prefix": "MEAL#" },
    })
  );
  return (Items ?? []).map((i) => i.data as MealEntry).sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
}

export async function dbSaveMeal(userId: string, meal: MealEntry): Promise<void> {
  const doc = getDocClient();
  await doc.send(
    new PutCommand({
      TableName: TABLE,
      Item: { PK: `USER#${userId}`, SK: `MEAL#${meal.date}#${meal.id}`, data: meal },
    })
  );
}

export async function dbDeleteMeal(userId: string, meal: MealEntry): Promise<void> {
  const doc = getDocClient();
  await doc.send(
    new DeleteCommand({
      TableName: TABLE,
      Key: { PK: `USER#${userId}`, SK: `MEAL#${meal.date}#${meal.id}` },
    })
  );
}

// ── Wearable Connections ─────────────────────────────────
export async function dbGetWearableConnections(userId: string): Promise<WearableConnection[]> {
  const doc = getDocClient();
  const { Items } = await doc.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: { ":pk": `USER#${userId}`, ":prefix": "WCONN#" },
    })
  );
  return (Items ?? []).map((i) => i.data as WearableConnection);
}

export async function dbSaveWearableConnection(userId: string, conn: WearableConnection): Promise<void> {
  const doc = getDocClient();
  await doc.send(
    new PutCommand({
      TableName: TABLE,
      Item: { PK: `USER#${userId}`, SK: `WCONN#${conn.provider}`, data: conn },
    })
  );
}

// ── Wearable Data ────────────────────────────────────────
export async function dbGetWearableData(userId: string): Promise<WearableDaySummary[]> {
  const doc = getDocClient();
  const { Items } = await doc.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: { ":pk": `USER#${userId}`, ":prefix": "WDATA#" },
    })
  );
  return (Items ?? []).map((i) => i.data as WearableDaySummary);
}

export async function dbSaveWearableData(userId: string, entries: WearableDaySummary[]): Promise<void> {
  if (entries.length === 0) return;
  const doc = getDocClient();
  const chunks: WearableDaySummary[][] = [];
  for (let i = 0; i < entries.length; i += 25) chunks.push(entries.slice(i, i + 25));
  for (const chunk of chunks) {
    await doc.send(
      new BatchWriteCommand({
        RequestItems: {
          [TABLE]: chunk.map((e) => ({
            PutRequest: {
              Item: { PK: `USER#${userId}`, SK: `WDATA#${e.date}#${e.provider}`, data: e },
            },
          })),
        },
      })
    );
  }
}

// ── Milestones ───────────────────────────────────────────
export async function dbGetMilestones(userId: string): Promise<Milestone[]> {
  const doc = getDocClient();
  const { Items } = await doc.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: { ":pk": `USER#${userId}`, ":prefix": "MILESTONE#" },
    })
  );
  return (Items ?? []).map((i) => i.data as Milestone);
}

export async function dbSaveMilestones(userId: string, milestones: Milestone[]): Promise<void> {
  if (milestones.length === 0) return;
  const doc = getDocClient();
  const chunks: Milestone[][] = [];
  for (let i = 0; i < milestones.length; i += 25) chunks.push(milestones.slice(i, i + 25));
  for (const chunk of chunks) {
    await doc.send(
      new BatchWriteCommand({
        RequestItems: {
          [TABLE]: chunk.map((m) => ({
            PutRequest: {
              Item: { PK: `USER#${userId}`, SK: `MILESTONE#${m.id}`, data: m },
            },
          })),
        },
      })
    );
  }
}

// ── Meta (xp, hasAdjusted, ricoHistory) ──────────────────
export interface UserMeta {
  xp: number;
  hasAdjusted: boolean;
  ricoHistory: RicoMessage[];
}

export async function dbGetMeta(userId: string): Promise<UserMeta> {
  const doc = getDocClient();
  const { Item } = await doc.send(
    new GetCommand({ TableName: TABLE, Key: { PK: `USER#${userId}`, SK: "META" } })
  );
  return Item
    ? (Item.data as UserMeta)
    : { xp: 0, hasAdjusted: false, ricoHistory: [] };
}

export async function dbSaveMeta(userId: string, meta: UserMeta): Promise<void> {
  const doc = getDocClient();
  await doc.send(
    new PutCommand({
      TableName: TABLE,
      Item: { PK: `USER#${userId}`, SK: "META", data: meta, updatedAt: new Date().toISOString() },
    })
  );
}

// ── Weekly Review ────────────────────────────────────────
export async function dbGetWeeklyReview(userId: string): Promise<WeeklyReview | null> {
  const doc = getDocClient();
  const { Item } = await doc.send(
    new GetCommand({ TableName: TABLE, Key: { PK: `USER#${userId}`, SK: "WEEKLY_REVIEW" } })
  );
  return Item ? (Item.data as WeeklyReview) : null;
}

export async function dbSaveWeeklyReview(userId: string, review: WeeklyReview): Promise<void> {
  const doc = getDocClient();
  await doc.send(
    new PutCommand({
      TableName: TABLE,
      Item: { PK: `USER#${userId}`, SK: "WEEKLY_REVIEW", data: review, updatedAt: new Date().toISOString() },
    })
  );
}
