# DynamoDB Table Setup for Recomp

## 1. Create an IAM user (AWS Console)

1. Go to **IAM → Users → Create user**
2. Name it e.g. `recomp-app`
3. Attach a policy with DynamoDB permissions. Either:

   **Option A – Least privilege (recommended):**
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "dynamodb:GetItem",
           "dynamodb:PutItem",
           "dynamodb:UpdateItem",
           "dynamodb:DeleteItem",
           "dynamodb:Query",
           "dynamodb:BatchGetItem",
           "dynamodb:BatchWriteItem",
           "dynamodb:DescribeTable"
         ],
         "Resource": "arn:aws:dynamodb:us-east-1:*:table/RecompTable"
       },
       {
         "Effect": "Allow",
         "Action": "dynamodb:CreateTable",
         "Resource": "arn:aws:dynamodb:us-east-1:*:table/RecompTable"
       }
     ]
   }
   ```

   **Option B – Reuse Bedrock role:**  
   If you already use `bedrock:InvokeModel` for Nova, add the DynamoDB actions above to that role’s policy.

4. Create an **access key** for the user: **Security credentials → Create access key → Application running outside AWS**

## 2. Create the table

Set your credentials (use the same region as Bedrock if possible, e.g. `us-east-1`):

```bash
export AWS_ACCESS_KEY_ID=your-access-key
export AWS_SECRET_ACCESS_KEY=your-secret-key
export AWS_REGION=us-east-1
export DYNAMODB_TABLE_NAME=RecompTable  # optional, defaults to RecompTable
```

Run the script:

```bash
npx tsx scripts/create-table.ts
```

Or:

```bash
npm run dynamo:create-table
```

You should see `Table "RecompTable" created successfully.` or `Table "RecompTable" already exists.`

## 3. Add env vars to Vercel

In **Project → Settings → Environment Variables**, add:

| Variable                | Value           |
|-------------------------|-----------------|
| `AWS_ACCESS_KEY_ID`     | *(from step 1)* |
| `AWS_SECRET_ACCESS_KEY` | *(from step 1)* |
| `AWS_REGION`            | `us-east-1`     |
| `DYNAMODB_TABLE_NAME`   | `RecompTable`   |

Apply to **Production** (and Preview if you test there), then **Redeploy**.

## 4. Verify

1. Redeploy the app on Vercel
2. Complete onboarding (or use demo data)
3. Check `/api/judge/health` – `dynamodbSync` should be `"live"`

## Schema (reference)

Single-table design:

- **PK** (string, partition key)
- **SK** (string, sort key)

Patterns:

| PK              | SK        | Data                         |
|-----------------|-----------|------------------------------|
| `USER#{userId}` | `PROFILE` | User profile                 |
| `USER#{userId}` | `PLAN`    | Fitness plan                 |
| `USER#{userId}` | `META`    | xp, ricoHistory, etc.        |
| `USER#{userId}` | `MEAL#{date}#{id}` | Meal entry           |
| `USER#{userId}` | `MILESTONE#{id}`   | Milestone            |
| `USER#{userId}` | `WCONN#{provider}` | Wearable connection |
| `USER#{userId}` | `WDATA#{date}#{provider}` | Wearable data |
| `USER#{userId}` | `PUSH#...` | Push subscription        |
| `CALENDAR#{token}` | `CALENDAR#{token}` | Calendar feed token   |

Billing mode: **Pay per request** (no capacity to manage).
