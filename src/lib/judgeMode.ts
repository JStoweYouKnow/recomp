export type FeatureMode = "live" | "fallback" | "disabled";

function truthy(value: string | undefined): boolean {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function isJudgeMode(): boolean {
  return truthy(process.env.JUDGE_MODE);
}

/** When true, AI routes require authentication. Set in production to prevent abuse. Default false for demo compatibility. */
export function requireAuthForAI(): boolean {
  return truthy(process.env.REQUIRE_AUTH_FOR_AI);
}

function hasAwsCredentials(): boolean {
  return Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
}

function hasBedrockSetup(): boolean {
  return hasAwsCredentials() && Boolean(process.env.AWS_REGION);
}

export interface JudgeHealthPayload {
  judgeMode: boolean;
  checkedAt: string;
  features: {
    planGeneration: FeatureMode;
    voice: FeatureMode;
    actGrocery: FeatureMode;
    actNutrition: FeatureMode;
    reelVideo: FeatureMode;
    dynamodbSync: FeatureMode;
    wearables: FeatureMode;
  };
  notes: string[];
}

export function buildJudgeHealthPayload(): JudgeHealthPayload {
  const judgeMode = isJudgeMode();
  const bedrockReady = hasBedrockSetup();
  const actConfigured = Boolean(process.env.NOVA_ACT_API_KEY || process.env.NOVA_ACT_USER_DATA_DIR);
  const reelConfigured = Boolean(process.env.NOVA_REEL_S3_BUCKET);
  const dynamoConfigured = Boolean(process.env.DYNAMODB_TABLE_NAME);

  return {
    judgeMode,
    checkedAt: new Date().toISOString(),
    features: {
      planGeneration: bedrockReady ? "live" : "disabled",
      voice: bedrockReady ? "live" : "disabled",
      actGrocery: judgeMode ? "fallback" : actConfigured ? "live" : "fallback",
      actNutrition: judgeMode ? "fallback" : actConfigured ? "live" : "fallback",
      reelVideo: judgeMode ? "fallback" : reelConfigured && bedrockReady ? "live" : "fallback",
      dynamodbSync: judgeMode ? "fallback" : dynamoConfigured && bedrockReady ? "live" : "fallback",
      wearables: judgeMode ? "fallback" : "live",
    },
    notes: [
      judgeMode
        ? "JUDGE_MODE is enabled: optional integrations return deterministic fallback data."
        : "JUDGE_MODE is disabled: optional integrations run normally and may depend on external setup.",
      "Use this endpoint during judging to verify expected behavior before running the live demo flow.",
    ],
  };
}
