/**
 * One-time script to create the RecompTable in DynamoDB.
 * Run with: npx tsx scripts/create-table.ts
 */
import { DynamoDBClient, CreateTableCommand } from "@aws-sdk/client-dynamodb";

const TABLE = process.env.DYNAMODB_TABLE_NAME ?? "RecompTable";
const REGION = process.env.AWS_REGION ?? "us-east-1";

async function main() {
  const client = new DynamoDBClient({ region: REGION });
  try {
    await client.send(
      new CreateTableCommand({
        TableName: TABLE,
        KeySchema: [
          { AttributeName: "PK", KeyType: "HASH" },
          { AttributeName: "SK", KeyType: "RANGE" },
        ],
        AttributeDefinitions: [
          { AttributeName: "PK", AttributeType: "S" },
          { AttributeName: "SK", AttributeType: "S" },
        ],
        BillingMode: "PAY_PER_REQUEST",
      })
    );
    console.log(`Table "${TABLE}" created successfully.`);
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "ResourceInUseException") {
      console.log(`Table "${TABLE}" already exists.`);
    } else {
      throw err;
    }
  }
}

main().catch(console.error);
