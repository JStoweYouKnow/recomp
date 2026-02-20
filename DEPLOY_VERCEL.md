# Deploy Recomp to Vercel

## 1. Log in (one-time)

```bash
vercel login
```

Complete the browser or email flow.

## 2. Deploy

**Production:**
```bash
vercel --prod
```

**Preview (branch/PR):**
```bash
vercel
```

## 3. Environment variables (Vercel dashboard)

After the first deploy, set these in **Project → Settings → Environment Variables** so production works:

| Variable | Required | Notes |
|----------|----------|--------|
| `AWS_ACCESS_KEY_ID` | Yes* | Bedrock + DynamoDB access |
| `AWS_SECRET_ACCESS_KEY` | Yes* | *Or use IAM role if linked to Vercel |
| `AWS_REGION` | Yes | e.g. `us-east-1` |
| `DYNAMODB_TABLE_NAME` | Yes | e.g. `RecompTable` |
| `BEDROCK_NOVA_LITE_MODEL_ID` | Optional | Override Nova Lite model |
| `COOKING_WEBHOOK_SECRET` | Optional | For cooking app webhooks |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Optional | For push notifications |
| `NEXT_PUBLIC_APP_URL` | Optional | Production URL for OAuth callbacks |

Redeploy after changing env vars.

## 4. Notes

- **Nova Act** (grocery/nutrition Python scripts) does not run on Vercel serverless; those API routes will fail in production unless you run Act elsewhere. The rest of the app (plans, meals, calendar, cooking import, etc.) works.
- Use **Vercel → Logs** or `vercel logs <deployment-url>` to debug.
