import { createHash } from "crypto";
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
  SocialSettings,
  Group,
  GroupMembership,
  GroupMessage,
  GroupMemberProgress,
  HydrationEntry,
  FastingSession,
  BiofeedbackEntry,
  MetabolicModel,
  PantryItem,
  MealPrepPlan,
  CoachSchedule,
  Challenge,
  BodyScan,
  Supplement,
  BloodWork,
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

// ── Meta (xp, hasAdjusted, ricoHistory, calendarFeedToken) ──────────────────
export interface UserMeta {
  xp: number;
  hasAdjusted: boolean;
  ricoHistory: RicoMessage[];
  calendarFeedToken?: string;
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

// ── Calendar feed token (for iCal / Google Calendar subscribe) ─────────────────
export async function dbGetUserIdByCalendarToken(token: string): Promise<string | null> {
  if (!token || token.length > 64) return null;
  const doc = getDocClient();
  const { Item } = await doc.send(
    new GetCommand({ TableName: TABLE, Key: { PK: `CALENDAR#${token}`, SK: `CALENDAR#${token}` } })
  );
  return Item?.userId ?? null;
}

export async function dbSetCalendarToken(userId: string, token: string): Promise<void> {
  const doc = getDocClient();
  const meta = await dbGetMeta(userId);
  await Promise.all([
    doc.send(
      new PutCommand({
        TableName: TABLE,
        Item: {
          PK: `CALENDAR#${token}`,
          SK: `CALENDAR#${token}`,
          userId,
          updatedAt: new Date().toISOString(),
        },
      })
    ),
    dbSaveMeta(userId, { ...meta, calendarFeedToken: token }),
  ]);
}

// ── Push subscriptions (Web Push) ─────────────────────────────────────────
export interface PushSubscriptionRecord {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
  createdAt: string;
}

function pushSubscriptionSk(endpoint: string): string {
  const hash = createHash("sha256").update(endpoint).digest("base64url").slice(0, 32);
  return `PUSH#${hash}`;
}

export async function dbSavePushSubscription(userId: string, subscription: PushSubscriptionRecord): Promise<void> {
  const doc = getDocClient();
  const sk = pushSubscriptionSk(subscription.endpoint);
  await doc.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: `USER#${userId}`,
        SK: sk,
        data: subscription,
        updatedAt: new Date().toISOString(),
      },
    })
  );
}

export async function dbGetPushSubscriptions(userId: string): Promise<PushSubscriptionRecord[]> {
  const doc = getDocClient();
  const { Items } = await doc.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: { ":pk": `USER#${userId}`, ":prefix": "PUSH#" },
    })
  );
  return (Items ?? []).map((i) => i.data as PushSubscriptionRecord);
}

export async function dbDeletePushSubscription(userId: string, endpoint: string): Promise<void> {
  const doc = getDocClient();
  await doc.send(
    new DeleteCommand({
      TableName: TABLE,
      Key: { PK: `USER#${userId}`, SK: pushSubscriptionSk(endpoint) },
    })
  );
}

// ── Nutrition Cache ─────────────────────────────────────────────────────────
export interface NutritionCacheEntry {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: string;
  cachedAt: string;
}

function normalizeFood(food: string): string {
  return food.toLowerCase().trim().replace(/\s+/g, " ");
}

const NUTRITION_CACHE_TTL_DAYS = 30;

export async function dbGetNutritionCache(food: string): Promise<NutritionCacheEntry | null> {
  const doc = getDocClient();
  const key = normalizeFood(food);
  const { Item } = await doc.send(
    new GetCommand({ TableName: TABLE, Key: { PK: `NUTRITION#${key}`, SK: "CACHE" } })
  );
  if (!Item) return null;
  const entry = Item.data as NutritionCacheEntry;
  const age = Date.now() - new Date(entry.cachedAt).getTime();
  if (age > NUTRITION_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000) return null;
  return entry;
}

export async function dbSaveNutritionCache(food: string, entry: NutritionCacheEntry): Promise<void> {
  const doc = getDocClient();
  const key = normalizeFood(food);
  await doc.send(
    new PutCommand({
      TableName: TABLE,
      Item: { PK: `NUTRITION#${key}`, SK: "CACHE", data: entry, updatedAt: new Date().toISOString() },
    })
  );
}

// ── Expo Push Tokens (mobile app) ─────────────────────────────────────────
export interface ExpoPushTokenRecord {
  token: string;
  createdAt: string;
}

function expoTokenSk(token: string): string {
  const hash = createHash("sha256").update(token).digest("base64url").slice(0, 32);
  return `PUSH_EXPO#${hash}`;
}

export async function dbSaveExpoPushToken(userId: string, token: string): Promise<void> {
  const doc = getDocClient();
  await doc.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: `USER#${userId}`,
        SK: expoTokenSk(token),
        data: { token, createdAt: new Date().toISOString() },
        updatedAt: new Date().toISOString(),
      },
    })
  );
}

export async function dbGetExpoPushTokens(userId: string): Promise<ExpoPushTokenRecord[]> {
  const doc = getDocClient();
  const { Items } = await doc.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: { ":pk": `USER#${userId}`, ":prefix": "PUSH_EXPO#" },
    })
  );
  return (Items ?? []).map((i) => i.data as ExpoPushTokenRecord);
}

export async function dbDeleteExpoPushToken(userId: string, token: string): Promise<void> {
  const doc = getDocClient();
  await doc.send(
    new DeleteCommand({
      TableName: TABLE,
      Key: { PK: `USER#${userId}`, SK: expoTokenSk(token) },
    })
  );
}

// ── Social Settings ──────────────────────────────────────
export async function dbGetSocialSettings(userId: string): Promise<SocialSettings | null> {
  const doc = getDocClient();
  const { Item } = await doc.send(
    new GetCommand({ TableName: TABLE, Key: { PK: `USER#${userId}`, SK: "SOCIAL" } })
  );
  return Item ? (Item.data as SocialSettings) : null;
}

export async function dbSaveSocialSettings(userId: string, settings: SocialSettings): Promise<void> {
  const doc = getDocClient();
  await doc.send(
    new PutCommand({
      TableName: TABLE,
      Item: { PK: `USER#${userId}`, SK: "SOCIAL", data: settings, updatedAt: new Date().toISOString() },
    })
  );
}

// ── Username Lookup ──────────────────────────────────────
export async function dbGetUserIdByUsername(username: string): Promise<string | null> {
  if (!username) return null;
  const doc = getDocClient();
  const key = username.toLowerCase();
  const { Item } = await doc.send(
    new GetCommand({ TableName: TABLE, Key: { PK: `USERNAME#${key}`, SK: `USERNAME#${key}` } })
  );
  return Item?.userId ?? null;
}

export async function dbReserveUsername(userId: string, username: string): Promise<boolean> {
  const doc = getDocClient();
  const key = username.toLowerCase();
  try {
    await doc.send(
      new PutCommand({
        TableName: TABLE,
        Item: { PK: `USERNAME#${key}`, SK: `USERNAME#${key}`, userId, updatedAt: new Date().toISOString() },
        ConditionExpression: "attribute_not_exists(PK)",
      })
    );
    return true;
  } catch (err: unknown) {
    if (err && typeof err === "object" && "name" in err && err.name === "ConditionalCheckFailedException") return false;
    throw err;
  }
}

export async function dbReleaseUsername(username: string): Promise<void> {
  const doc = getDocClient();
  const key = username.toLowerCase();
  await doc.send(
    new DeleteCommand({ TableName: TABLE, Key: { PK: `USERNAME#${key}`, SK: `USERNAME#${key}` } })
  );
}

// ── Groups ───────────────────────────────────────────────
export async function dbCreateGroup(group: Group): Promise<void> {
  const doc = getDocClient();
  await doc.send(
    new PutCommand({
      TableName: TABLE,
      Item: { PK: `GROUP#${group.id}`, SK: "META", data: group, updatedAt: new Date().toISOString() },
    })
  );
}

export async function dbGetGroup(groupId: string): Promise<Group | null> {
  const doc = getDocClient();
  const { Item } = await doc.send(
    new GetCommand({ TableName: TABLE, Key: { PK: `GROUP#${groupId}`, SK: "META" } })
  );
  return Item ? (Item.data as Group) : null;
}

export async function dbUpdateGroup(groupId: string, updates: Partial<Group>): Promise<void> {
  const existing = await dbGetGroup(groupId);
  if (!existing) return;
  const updated = { ...existing, ...updates };
  await dbCreateGroup(updated);
}

export async function dbDeleteGroup(groupId: string): Promise<void> {
  const doc = getDocClient();
  // Query all items under the GROUP#{groupId} partition
  const { Items } = await doc.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: { ":pk": `GROUP#${groupId}` },
    })
  );
  if (!Items || Items.length === 0) return;

  // Extract member userIds from MEMBER#{userId} SKs for reverse-lookup cleanup
  const memberUserIds: string[] = [];
  for (const item of Items) {
    const sk = item.SK as string;
    if (sk.startsWith("MEMBER#")) {
      memberUserIds.push(sk.slice("MEMBER#".length));
    }
  }

  // Delete all items under the GROUP#{groupId} partition (META, MEMBER#, MSG#, PROGRESS#)
  const chunks: typeof Items[] = [];
  for (let i = 0; i < Items.length; i += 25) chunks.push(Items.slice(i, i + 25));
  for (const chunk of chunks) {
    await doc.send(
      new BatchWriteCommand({
        RequestItems: {
          [TABLE]: chunk.map((item) => ({
            DeleteRequest: { Key: { PK: item.PK, SK: item.SK } },
          })),
        },
      })
    );
  }

  // Clean up reverse lookups: USER#{userId}/GROUP#{groupId} for every member
  if (memberUserIds.length > 0) {
    const reverseItems = memberUserIds.map((uid) => ({
      DeleteRequest: { Key: { PK: `USER#${uid}`, SK: `GROUP#${groupId}` } },
    }));
    const reverseChunks = [];
    for (let i = 0; i < reverseItems.length; i += 25) reverseChunks.push(reverseItems.slice(i, i + 25));
    for (const chunk of reverseChunks) {
      await doc.send(
        new BatchWriteCommand({ RequestItems: { [TABLE]: chunk } })
      );
    }
  }
}

// ── Group Membership ─────────────────────────────────────
export async function dbAddGroupMember(
  groupId: string,
  userId: string,
  role: "owner" | "member",
  groupName: string
): Promise<void> {
  const doc = getDocClient();
  const now = new Date().toISOString();
  const membership: GroupMembership = { groupId, groupName, role, joinedAt: now };
  await Promise.all([
    doc.send(
      new PutCommand({
        TableName: TABLE,
        Item: { PK: `GROUP#${groupId}`, SK: `MEMBER#${userId}`, data: membership, updatedAt: now },
      })
    ),
    doc.send(
      new PutCommand({
        TableName: TABLE,
        Item: { PK: `USER#${userId}`, SK: `GROUP#${groupId}`, data: membership, updatedAt: now },
      })
    ),
  ]);
}

export async function dbRemoveGroupMember(groupId: string, userId: string): Promise<void> {
  const doc = getDocClient();
  await Promise.all([
    doc.send(new DeleteCommand({ TableName: TABLE, Key: { PK: `GROUP#${groupId}`, SK: `MEMBER#${userId}` } })),
    doc.send(new DeleteCommand({ TableName: TABLE, Key: { PK: `USER#${userId}`, SK: `GROUP#${groupId}` } })),
  ]);
}

export async function dbGetGroupMembers(groupId: string): Promise<GroupMembership[]> {
  const doc = getDocClient();
  const { Items } = await doc.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: { ":pk": `GROUP#${groupId}`, ":prefix": "MEMBER#" },
    })
  );
  return (Items ?? []).map((i) => i.data as GroupMembership);
}

export async function dbGetUserGroups(userId: string): Promise<GroupMembership[]> {
  const doc = getDocClient();
  const { Items } = await doc.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: { ":pk": `USER#${userId}`, ":prefix": "GROUP#" },
    })
  );
  return (Items ?? []).map((i) => i.data as GroupMembership);
}

// ── Group Invite Codes ───────────────────────────────────
export async function dbGetGroupByInviteCode(code: string): Promise<string | null> {
  if (!code) return null;
  const doc = getDocClient();
  const { Item } = await doc.send(
    new GetCommand({ TableName: TABLE, Key: { PK: `INVITE#${code}`, SK: `INVITE#${code}` } })
  );
  return Item?.groupId ?? null;
}

export async function dbSetInviteCode(groupId: string, code: string): Promise<void> {
  const doc = getDocClient();
  await doc.send(
    new PutCommand({
      TableName: TABLE,
      Item: { PK: `INVITE#${code}`, SK: `INVITE#${code}`, groupId, updatedAt: new Date().toISOString() },
    })
  );
}

export async function dbDeleteInviteCode(code: string): Promise<void> {
  const doc = getDocClient();
  await doc.send(
    new DeleteCommand({ TableName: TABLE, Key: { PK: `INVITE#${code}`, SK: `INVITE#${code}` } })
  );
}

// ── Group Messages ───────────────────────────────────────
export async function dbPostGroupMessage(groupId: string, message: GroupMessage): Promise<void> {
  const doc = getDocClient();
  await doc.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: `GROUP#${groupId}`,
        SK: `MSG#${message.createdAt}#${message.id}`,
        data: message,
        updatedAt: new Date().toISOString(),
      },
    })
  );
}

export async function dbGetGroupMessages(groupId: string, limit = 50): Promise<GroupMessage[]> {
  const doc = getDocClient();
  const { Items } = await doc.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: { ":pk": `GROUP#${groupId}`, ":prefix": "MSG#" },
      ScanIndexForward: false,
      Limit: limit,
    })
  );
  return (Items ?? []).map((i) => i.data as GroupMessage).reverse();
}

export async function dbDeleteGroupMessage(groupId: string, messageId: string, timestamp: string): Promise<void> {
  const doc = getDocClient();
  await doc.send(
    new DeleteCommand({
      TableName: TABLE,
      Key: { PK: `GROUP#${groupId}`, SK: `MSG#${timestamp}#${messageId}` },
    })
  );
}

export async function dbUpdateGroupMessagePin(
  groupId: string,
  messageId: string,
  timestamp: string,
  pinned: boolean
): Promise<GroupMessage | null> {
  const doc = getDocClient();
  const key = { PK: `GROUP#${groupId}`, SK: `MSG#${timestamp}#${messageId}` };
  const { Item } = await doc.send(new GetCommand({ TableName: TABLE, Key: key }));
  if (!Item?.data) return null;
  const msg = Item.data as GroupMessage;
  const updated: GroupMessage = { ...msg, pinnedAt: pinned ? new Date().toISOString() : undefined };
  await doc.send(
    new PutCommand({
      TableName: TABLE,
      Item: { ...key, data: updated, updatedAt: new Date().toISOString() },
    })
  );
  return updated;
}

// ── Group Progress ───────────────────────────────────────
export async function dbSaveGroupProgress(groupId: string, userId: string, progress: GroupMemberProgress): Promise<void> {
  const doc = getDocClient();
  await doc.send(
    new PutCommand({
      TableName: TABLE,
      Item: { PK: `GROUP#${groupId}`, SK: `PROGRESS#${userId}`, data: progress, updatedAt: new Date().toISOString() },
    })
  );
}

export async function dbGetGroupProgress(groupId: string): Promise<GroupMemberProgress[]> {
  const doc = getDocClient();
  const { Items } = await doc.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: { ":pk": `GROUP#${groupId}`, ":prefix": "PROGRESS#" },
    })
  );
  return (Items ?? []).map((i) => i.data as GroupMemberProgress);
}

// ── Groups Index (Discovery) ─────────────────────────────
// Sharded by goal type to distribute reads/writes across partitions.
// PK: GROUPS_INDEX#{goalType}, SK: GROUP#{groupId}
import type { GroupGoalType } from "./types";

const ALL_GOAL_TYPES: GroupGoalType[] = ["lose_weight", "build_muscle", "consistency", "macro_targets", "custom"];

export async function dbAddToGroupsIndex(group: Group): Promise<void> {
  const doc = getDocClient();
  await doc.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: `GROUPS_INDEX#${group.goalType}`,
        SK: `GROUP#${group.id}`,
        data: group,
        updatedAt: new Date().toISOString(),
      },
    })
  );
}

export async function dbRemoveFromGroupsIndex(groupId: string, goalType?: GroupGoalType): Promise<void> {
  const doc = getDocClient();
  if (goalType) {
    await doc.send(
      new DeleteCommand({ TableName: TABLE, Key: { PK: `GROUPS_INDEX#${goalType}`, SK: `GROUP#${groupId}` } })
    );
  } else {
    // Goal type unknown — fan out delete across all shards
    await Promise.all(
      ALL_GOAL_TYPES.map((gt) =>
        doc.send(
          new DeleteCommand({ TableName: TABLE, Key: { PK: `GROUPS_INDEX#${gt}`, SK: `GROUP#${groupId}` } })
        ).catch(() => {})
      )
    );
  }
}

// ── Feedback (user testing / traction) ────────────────────────────────────
export interface FeedbackEntry {
  rating?: number; // 1-5
  text?: string;
  userId?: string;
  createdAt: string;
}

export async function dbSaveFeedback(entry: FeedbackEntry): Promise<void> {
  const doc = getDocClient();
  const sk = `FEEDBACK#${entry.createdAt}#${crypto.randomUUID()}`;
  await doc.send(
    new PutCommand({
      TableName: TABLE,
      Item: { PK: "FEEDBACK", SK: sk, data: entry, updatedAt: new Date().toISOString() },
    })
  );
}

export async function dbListOpenGroups(goalType?: GroupGoalType): Promise<Group[]> {
  const doc = getDocClient();
  const typesToQuery = goalType ? [goalType] : ALL_GOAL_TYPES;
  const results = await Promise.all(
    typesToQuery.map(async (gt) => {
      const { Items } = await doc.send(
        new QueryCommand({
          TableName: TABLE,
          KeyConditionExpression: "PK = :pk",
          ExpressionAttributeValues: { ":pk": `GROUPS_INDEX#${gt}` },
        })
      );
      return (Items ?? []).map((i) => i.data as Group);
    })
  );
  // Merge all shards, newest first
  return results.flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ── Hydration ───────────────────────────────────────────
export async function dbGetHydration(userId: string): Promise<HydrationEntry[]> {
  const doc = getDocClient();
  const { Items } = await doc.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: { ":pk": `USER#${userId}`, ":prefix": "HYDRATION#" },
    })
  );
  return (Items ?? []).map((i) => i.data as HydrationEntry);
}

export async function dbSaveHydrationEntry(userId: string, entry: HydrationEntry): Promise<void> {
  const doc = getDocClient();
  await doc.send(
    new PutCommand({
      TableName: TABLE,
      Item: { PK: `USER#${userId}`, SK: `HYDRATION#${entry.date}#${entry.id}`, data: entry },
    })
  );
}

// ── Fasting Sessions ────────────────────────────────────
export async function dbGetFastingSessions(userId: string): Promise<FastingSession[]> {
  const doc = getDocClient();
  const { Items } = await doc.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: { ":pk": `USER#${userId}`, ":prefix": "FASTING#" },
    })
  );
  return (Items ?? []).map((i) => i.data as FastingSession);
}

export async function dbSaveFastingSession(userId: string, session: FastingSession): Promise<void> {
  const doc = getDocClient();
  await doc.send(
    new PutCommand({
      TableName: TABLE,
      Item: { PK: `USER#${userId}`, SK: `FASTING#${session.startTime}#${session.id}`, data: session },
    })
  );
}

// ── Biofeedback ─────────────────────────────────────────
export async function dbGetBiofeedback(userId: string): Promise<BiofeedbackEntry[]> {
  const doc = getDocClient();
  const { Items } = await doc.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: { ":pk": `USER#${userId}`, ":prefix": "BIOFEEDBACK#" },
    })
  );
  return (Items ?? []).map((i) => i.data as BiofeedbackEntry);
}

export async function dbSaveBiofeedbackEntry(userId: string, entry: BiofeedbackEntry): Promise<void> {
  const doc = getDocClient();
  await doc.send(
    new PutCommand({
      TableName: TABLE,
      Item: { PK: `USER#${userId}`, SK: `BIOFEEDBACK#${entry.date}#${entry.id}`, data: entry },
    })
  );
}

// ── Metabolic Model ─────────────────────────────────────
export async function dbGetMetabolicModel(userId: string): Promise<MetabolicModel | null> {
  const doc = getDocClient();
  const { Item } = await doc.send(
    new GetCommand({ TableName: TABLE, Key: { PK: `USER#${userId}`, SK: "METABOLIC_MODEL" } })
  );
  return Item ? (Item.data as MetabolicModel) : null;
}

export async function dbSaveMetabolicModel(userId: string, model: MetabolicModel): Promise<void> {
  const doc = getDocClient();
  await doc.send(
    new PutCommand({
      TableName: TABLE,
      Item: { PK: `USER#${userId}`, SK: "METABOLIC_MODEL", data: model, updatedAt: new Date().toISOString() },
    })
  );
}

// ── Pantry ──────────────────────────────────────────────
export async function dbGetPantry(userId: string): Promise<PantryItem[]> {
  const doc = getDocClient();
  const { Item } = await doc.send(
    new GetCommand({ TableName: TABLE, Key: { PK: `USER#${userId}`, SK: "PANTRY" } })
  );
  return Item ? (Item.data as PantryItem[]) : [];
}

export async function dbSavePantry(userId: string, items: PantryItem[]): Promise<void> {
  const doc = getDocClient();
  await doc.send(
    new PutCommand({
      TableName: TABLE,
      Item: { PK: `USER#${userId}`, SK: "PANTRY", data: items, updatedAt: new Date().toISOString() },
    })
  );
}

// ── Meal Prep ───────────────────────────────────────────
export async function dbGetMealPrepPlan(userId: string, weekStart: string): Promise<MealPrepPlan | null> {
  const doc = getDocClient();
  const { Item } = await doc.send(
    new GetCommand({ TableName: TABLE, Key: { PK: `USER#${userId}`, SK: `MEAL_PREP#${weekStart}` } })
  );
  return Item ? (Item.data as MealPrepPlan) : null;
}

export async function dbSaveMealPrepPlan(userId: string, plan: MealPrepPlan): Promise<void> {
  const doc = getDocClient();
  await doc.send(
    new PutCommand({
      TableName: TABLE,
      Item: { PK: `USER#${userId}`, SK: `MEAL_PREP#${plan.weekStart}`, data: plan, updatedAt: new Date().toISOString() },
    })
  );
}

// ── Coach Schedule ──────────────────────────────────────
export async function dbGetCoachSchedule(userId: string): Promise<CoachSchedule | null> {
  const doc = getDocClient();
  const { Item } = await doc.send(
    new GetCommand({ TableName: TABLE, Key: { PK: `USER#${userId}`, SK: "COACH_SCHEDULE" } })
  );
  return Item ? (Item.data as CoachSchedule) : null;
}

export async function dbSaveCoachSchedule(userId: string, schedule: CoachSchedule): Promise<void> {
  const doc = getDocClient();
  await doc.send(
    new PutCommand({
      TableName: TABLE,
      Item: { PK: `USER#${userId}`, SK: "COACH_SCHEDULE", data: schedule, updatedAt: new Date().toISOString() },
    })
  );
}

// ── Challenges ──────────────────────────────────────────
export async function dbCreateChallenge(challenge: Challenge): Promise<void> {
  const doc = getDocClient();
  await doc.send(
    new PutCommand({
      TableName: TABLE,
      Item: { PK: `CHALLENGE#${challenge.id}`, SK: "META", data: challenge, updatedAt: new Date().toISOString() },
    })
  );
}

export async function dbGetChallenge(challengeId: string): Promise<Challenge | null> {
  const doc = getDocClient();
  const { Item } = await doc.send(
    new GetCommand({ TableName: TABLE, Key: { PK: `CHALLENGE#${challengeId}`, SK: "META" } })
  );
  return Item ? (Item.data as Challenge) : null;
}

export async function dbUpdateChallengeProgress(
  challengeId: string,
  userId: string,
  progress: number,
  score: number
): Promise<void> {
  const challenge = await dbGetChallenge(challengeId);
  if (!challenge) return;
  const updated = {
    ...challenge,
    participants: challenge.participants.map((p) =>
      p.userId === userId ? { ...p, progress, score } : p
    ),
  };
  await dbCreateChallenge(updated);
}

export async function dbGetUserChallenges(userId: string): Promise<Challenge[]> {
  const doc = getDocClient();
  const { Items } = await doc.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: { ":pk": `USER#${userId}`, ":prefix": "CHALLENGE#" },
    })
  );
  return (Items ?? []).map((i) => i.data as Challenge);
}

export async function dbAddUserChallenge(userId: string, challenge: Challenge): Promise<void> {
  const doc = getDocClient();
  await doc.send(
    new PutCommand({
      TableName: TABLE,
      Item: { PK: `USER#${userId}`, SK: `CHALLENGE#${challenge.id}`, data: challenge, updatedAt: new Date().toISOString() },
    })
  );
}

// ── Body Scans ──────────────────────────────────────────
export async function dbGetBodyScans(userId: string): Promise<BodyScan[]> {
  const doc = getDocClient();
  const { Items } = await doc.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: { ":pk": `USER#${userId}`, ":prefix": "BODY_SCAN#" },
    })
  );
  return (Items ?? []).map((i) => i.data as BodyScan);
}

export async function dbSaveBodyScan(userId: string, scan: BodyScan): Promise<void> {
  const doc = getDocClient();
  await doc.send(
    new PutCommand({
      TableName: TABLE,
      Item: { PK: `USER#${userId}`, SK: `BODY_SCAN#${scan.date}#${scan.id}`, data: scan },
    })
  );
}

// ── Supplements ─────────────────────────────────────────
export async function dbGetSupplements(userId: string): Promise<Supplement[]> {
  const doc = getDocClient();
  const { Item } = await doc.send(
    new GetCommand({ TableName: TABLE, Key: { PK: `USER#${userId}`, SK: "SUPPLEMENTS" } })
  );
  return Item ? (Item.data as Supplement[]) : [];
}

export async function dbSaveSupplements(userId: string, supplements: Supplement[]): Promise<void> {
  const doc = getDocClient();
  await doc.send(
    new PutCommand({
      TableName: TABLE,
      Item: { PK: `USER#${userId}`, SK: "SUPPLEMENTS", data: supplements, updatedAt: new Date().toISOString() },
    })
  );
}

// ── Blood Work ──────────────────────────────────────────
export async function dbGetBloodWork(userId: string): Promise<BloodWork[]> {
  const doc = getDocClient();
  const { Items } = await doc.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: { ":pk": `USER#${userId}`, ":prefix": "BLOODWORK#" },
    })
  );
  return (Items ?? []).map((i) => i.data as BloodWork);
}

export async function dbSaveBloodWork(userId: string, entry: BloodWork): Promise<void> {
  const doc = getDocClient();
  await doc.send(
    new PutCommand({
      TableName: TABLE,
      Item: { PK: `USER#${userId}`, SK: `BLOODWORK#${entry.date}#${entry.id}`, data: entry },
    })
  );
}
