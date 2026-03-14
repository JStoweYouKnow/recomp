/**
 * Add GSI1 to an existing DynamoDB table.
 * Run with: npx tsx scripts/add-gsi1.ts
 *
 * Index: GSI1
 * Partition key: GSI1PK (String)
 * Sort key: GSI1SK (String)
 */
import {
  DynamoDBClient,
  UpdateTableCommand,
  DescribeTableCommand,
} from "@aws-sdk/client-dynamodb";

const TABLE = process.env.DYNAMODB_TABLE_NAME ?? "RefactorTable";
const REGION = process.env.AWS_REGION ?? "us-east-1";

async function main() {
  const client = new DynamoDBClient({ region: REGION });

  // Check if GSI1 already exists
  const desc = await client.send(
    new DescribeTableCommand({ TableName: TABLE })
  );
  const existing = desc.Table?.GlobalSecondaryIndexes ?? [];
  if (existing.some((g) => g.IndexName === "GSI1")) {
    console.log(`GSI1 already exists on table "${TABLE}".`);
    return;
  }

  await client.send(
    new UpdateTableCommand({
      TableName: TABLE,
      AttributeDefinitions: [
        { AttributeName: "GSI1PK", AttributeType: "S" },
        { AttributeName: "GSI1SK", AttributeType: "S" },
      ],
      GlobalSecondaryIndexUpdates: [
        {
          Create: {
            IndexName: "GSI1",
            KeySchema: [
              { AttributeName: "GSI1PK", KeyType: "HASH" },
              { AttributeName: "GSI1SK", KeyType: "RANGE" },
            ],
            Projection: { ProjectionType: "ALL" },
          },
        },
      ],
    })
  );

  console.log(
    `GSI1 added to table "${TABLE}". Index is backfilling (can take a few minutes for large tables).`
  );
}

main().catch(console.error);
