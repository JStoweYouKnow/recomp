# Recomp

**A multi-agent, multimodal AI system built on the full Amazon Nova portfolio** — 8 Nova features (Lite, Sonic, Canvas, Reel, Act, Embeddings, Web Grounding, Extended Thinking) orchestrated into a cohesive body recomposition app. Dynamic agent routing, bidirectional voice streaming, browser automation, and tool-use agentic loops demonstrate Nova's capabilities as a full-stack AI platform.

Built for the [Amazon Nova AI Hackathon](https://amazon-nova.devpost.com).

**Repository:** [github.com/JStoweYouKnow/recomp](https://github.com/JStoweYouKnow/recomp)

## Quick Start for Judges

> **Live demo:** [https://recomp-one.vercel.app](https://recomp-one.vercel.app)
>
> 1. Click **"Try pre-seeded demo user"** — no setup needed
> 2. Dashboard loads instantly with 7 days of sample data
> 3. Try: **Log a meal** (text/voice/photo) → **Reco AI coach** (tap the Reco button) → **Weekly review** (Dashboard → Generate)
> 4. All 8 Nova features work out of the box in demo mode
>
> **Health check:** `GET /api/judge/health` — returns status of all integrations (Bedrock, DynamoDB, Act service, wearables)
>
> **Act service status:** `GET /api/act/status` — confirms whether Nova Act grocery/nutrition automation is live or falling back to demo mode

---

## Why This Architecture Matters

Most Nova integrations use one or two models for text generation. Recomp demonstrates how the **entire Nova portfolio** can be composed into a single cohesive experience:

- **Multi-agent orchestration** with dynamic routing — the coordinator examines available data and selectively invokes specialist agents, each using Bedrock Converse tool-use loops
- **Bidirectional voice streaming** via Nova Sonic — real-time audio-in, audio-out for conversational onboarding and an AI coach
- **Browser automation** via Nova Act — grocery search with one-tap Amazon links; add-to-cart requires local session (see [Nova Act](#nova-act-optional))
- **Multimodal understanding** — plate photos, receipt scans, body segmentation, and text all processed by Nova Lite
- **Extended thinking** for complex reasoning during plan generation

The result: a production-grade app that treats Nova not as a text generator, but as an **AI operating system**.

## Impact

Recomp makes body recomposition accessible to anyone with a browser. **Community impact**: Fitness guidance is often siloed, expensive, or generic. Recomp uses Nova for personalized plans and real-time meal logging (voice, photo, receipt scan, text) at no per-use cost beyond AWS. **Enterprise potential**: Wearable integration (Oura, Fitbit, Apple Health) enables employer wellness without app sprawl.

**Impact & roadmap:** Community impact (accessibility, cost, personalization). Enterprise use cases: corporate wellness, health plans, gyms. Post-hackathon: open source, self-host, mobile PWA, freemium tier, enterprise licensing.

## Innovation Highlights

What makes Recomp novel — both technically and as a product:

- **Dynamic agent routing** — The weekly review coordinator examines available data (meals, wearables) and selectively invokes specialist agents. No wearable data? Skip the biometrics agent, run research-only. No meals logged? Skip meal analysis. This is genuinely adaptive agentic behavior.
- **Conversational onboarding** — Users can set up their profile via voice conversation with Nova Sonic instead of filling a form. The AI asks questions one at a time, then extracts structured profile data.
- **Dynamic caloric budget** — Log activity to earn calories, or sedentary time to deduct; budget adjusts in real time (not a fixed daily target).
- **AI transformation preview** — Upload a full-body photo; Nova Canvas generates an "after" image based on your goal. Body segmentation ensures clean compositing.
- **Nova Act grocery & nutrition** — Searches Amazon for diet-plan ingredients; returns one-tap links in cloud; add-to-cart requires local session. USDA nutrition via Act service (Railway) or web grounding.
- **Multi-agent weekly review** — Coordinator + meal analyst + wellness (wearable + web research) + synthesis; parallel execution with tool-call rounds.
- **4-way meal logging** — Text, voice (Nova Sonic), photo (Nova Lite vision), and receipt scan in one flow.

## Judge Access

- **Live demo**: [https://recomp-one.vercel.app/](https://recomp-one.vercel.app/). To deploy your own: [Deploy to Vercel](#deployment-vercel) — `vercel --prod` (requires `vercel login`). Add the deployment URL to your Devpost submission. Configure `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` in Vercel dashboard. **For judge demos:** "Try pre-seeded demo" sets an auth cookie via `/api/auth/demo`, so AI routes work even if `REQUIRE_AUTH_FOR_AI=true`; leave it unset/false for best experience.
- **Repo access (if private)**: Add `testing@devpost.com` and `Amazon-Nova-hackathon@amazon.com` as collaborators (GitHub → Settings → Collaborators), or make the repo public.
- **AWS**: For a hosted demo, configure Bedrock credentials in the deployment environment. For local evaluation, judges can run `npm run dev` with their own AWS credentials (see Setup).
- **Demo mode**: When running without auth (e.g., first-time visit or cleared cookies), the app stores data in localStorage and shows a "Demo mode" banner. Complete onboarding to register and sync to the server.
- **Judge reliability mode**: Set `JUDGE_MODE=true` to force deterministic fallback for optional integrations (Nova Act, Nova Reel, DynamoDB sync, wearables). Check readiness at `/api/judge/health`.
- **Submission**: Demo video (~3 min, #AmazonNova), live URL, repo access, Devpost form.

### 2-minute golden path (judges)

1. Open app and click **Try pre-seeded demo user (instant dashboard)** on landing.
2. Dashboard loads with Jordan's 7-day data. Click **Show metrics** in the "Evidence & Results" card.
3. Open Meals and add one text meal.
4. Return to Dashboard and click **Generate** in Weekly AI Review (multi-agent demo).
5. Open Reco (🧩) and send one text message, or switch to **Voice** and hold the mic for Nova Sonic.

If optional integrations are unavailable, set `JUDGE_MODE=true` for deterministic fallback. Verify with `GET /api/judge/health`.

### How to Evaluate (judges)

Suggested flow to assess all Nova features (~5–10 min):

1. **Onboarding** — Fill the form and submit. Plan generation uses Nova Lite + extended thinking.
2. **Dashboard** — "Today at a Glance" (budget, macros, today's workout/diet), unified calendar with diet/workout popups and "Edit plan," transformation preview (upload photo → "after" image via Nova Canvas).
3. **Meals / Workouts** — Use the calendar to pick a date; view or edit that day's meals or workout. On Workouts, use "Show demo" / "Hide demo" for inline exercise GIFs.
4. **Meals — Log a meal** — Try **Voice log** (Nova Sonic) or **Snap plate** (Nova Lite image), or **Auto-fill nutrition** (Nova Act or web grounding fallback).
5. **Reco** — Click the 🧩 button; chat with the AI coach (text or voice via Nova Sonic).
6. **Weekly review** — Dashboard → "Generate" in the Weekly AI Review card (multi-agent orchestration).
7. **Adjust** — Navigate to Adjust; add feedback and run plan adjustments (Nova Lite).
8. **Wearables** — Connect Oura/Fitbit or import health data (optional).

## Features

- **Personalized plans** — AI-generated diet and workout plans based on fitness level, goals, restrictions, and more
- **Unified calendar** — Same calendar on Dashboard, Meals, and Workouts; date-based filtering; single-day workout view; "Edit plan" from calendar popups
- **Today at a Glance** — Dashboard hero: caloric budget bar, macro pills, today’s workout and diet mini-cards
- **Exercise demo GIFs** — Inline demos with target muscles on dashboard and Workouts tab; show/hide per exercise
- **Calorie & macro tracking** — Daily targets and progress bars for calories, protein, carbs, and fat
- **Meal logging (4 ways)** — Text, voice (Nova Sonic), photo analysis, and receipt scanning
- **Reco AI Coach** — Conversational fitness coach with text + voice modes (bidirectional Nova Sonic streaming)
- **Agentic Weekly Review** — Multi-agent autonomous analysis: meal patterns, wearable trends, web research, and synthesized recommendations
- **Dynamic plan adjustments** — AI-powered suggestions based on progress, feedback, and wearable data
- **Receipt scanning** — Photograph a grocery receipt, Nova extracts food items with estimated macros
- **Wearable connectivity** — Oura Ring, Fitbit, Apple Watch (HealthKit bridge), Health Connect (import)
- **Nova Act automation** — Grocery search → Amazon product links; USDA nutrition lookup. Add-to-cart in cloud = links; true automation requires local session.
- **Nova Labs** — Explore Canvas image generation, Reel video generation, multimodal embeddings, and web grounding
- **DynamoDB persistence** — Server-side storage with cookie-based auth; falls back to localStorage when offline
- **Demo mode indicator** — When using the app without auth (localStorage only), a banner shows "Demo mode — Data stored locally"
- **Offline support** — Error boundaries and local-first design

## Tech Stack

- **Next.js 16** (App Router, React 19)
- **Amazon Nova 2 Lite** — Plan generation, meal suggestions, photo analysis, Reco coach, weekly review agent
- **Amazon Nova 2 Sonic** — Bidirectional streaming voice for Reco chat and meal logging
- **Amazon Nova Canvas** — AI image generation
- **Amazon Nova Reel** — AI video generation (requires S3)
- **Amazon Nova Multimodal Embeddings** — Text/image similarity
- **Amazon Nova Act** — Browser UI automation (Python SDK, with demo-mode fallback)
- **Amazon DynamoDB** — Single-table design for user profiles, meals, plans, milestones, wearable data
- **TypeScript**, **Tailwind CSS v4**, **Zod** validation
- **Vitest** + Testing Library for unit tests

## Prerequisites

1. **AWS account** with access to Amazon Bedrock
2. **Nova 2 Lite** model enabled in Bedrock ([Bedrock Console](https://console.aws.amazon.com/bedrock) → Model access)
3. **AWS credentials** configured (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`)
4. **DynamoDB table** (optional — app works without it using localStorage)

## Setup

```bash
cd recomp
npm install
```

Create a `.env.local` file:

```
AWS_REGION=us-east-1
DYNAMODB_TABLE_NAME=RecompTable

# Optional — Web grounding (research / nutrition lookup)
BEDROCK_NOVA_WEB_GROUNDING_MODEL_ID=us.amazon.nova-2-lite-v1:0
# IAM: add bedrock:InvokeTool on arn:aws:bedrock::{account}:system-tool/amazon.nova_grounding

# Optional
NOVA_REEL_S3_BUCKET=your-bucket-name
FITBIT_CLIENT_ID=...
FITBIT_CLIENT_SECRET=...
APPLE_HEALTH_INGEST_KEY=...
NOVA_ACT_API_KEY=...
JUDGE_MODE=false

# Optional — require auth for AI routes (rico, weekly review, meals/suggest, research, images, video, embeddings)
# Set to true in production to prevent anonymous abuse of Bedrock. Default false for hackathon demo compatibility.
REQUIRE_AUTH_FOR_AI=false
```

Configure AWS credentials (e.g. `~/.aws/credentials` or environment variables).

If your Bedrock account requires inference profiles (instead of on-demand model IDs), set:

```
BEDROCK_NOVA_LITE_MODEL_ID=us.amazon.nova-2-lite-v1:0
```

You can also use a full inference profile ARN.

### DynamoDB Table (optional)

1. Create IAM user with DynamoDB permissions (`dynamodb:*` on `RecompTable`).
2. Run: `export AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_REGION=us-east-1 && npm run dynamo:create-table`
3. Add `DYNAMODB_TABLE_NAME=RecompTable` to Vercel env.

**Schema:** Single-table design. PK/SK patterns: `USER#{userId}#PROFILE`, `USER#{userId}#MEAL#{date}#{id}`, `USER#{userId}#PLAN`, etc. See [ARCHITECTURE.md](./ARCHITECTURE.md).

### Nova Act (optional)

Nova Act powers nutrition lookup and grocery automation.

**API key (required):** Get from [nova.amazon.com/act → Dev Tools](https://nova.amazon.com/act?tab=dev_tools). Add `NOVA_ACT_API_KEY` to `.env.local`.

**Local:** `pip install nova-act`. Nutrition/grocery work via Python subprocess. Add-to-cart needs one-time `scripts/setup_amazon_login.py`; set `NOVA_ACT_USER_DATA_DIR`.

**Production:** Act does not run on Vercel (no Python). Deploy `act-service/` to Railway/Render:

```bash
cd recomp && railway login && railway up
railway variable set NOVA_ACT_API_KEY=your-key
```

Generate domain in Railway → Settings → Networking. Add `ACT_SERVICE_URL=https://your-act.up.railway.app` to Vercel.

**Troubleshooting:** "Authentication Failed" → set `NOVA_ACT_API_KEY`. "Python not found" → set `ACT_PYTHON` to full path. Nutrition returns estimated → install `nova-act`, restart.

### Known Limitations

| Feature | Works without | Notes |
|---------|----------------|-------|
| **Demo mode** | Yes | Full app with localStorage; no server sync |
| **Plan generation** | Bedrock credentials | Requires AWS + Nova Lite; fails with clear error if missing |
| **Meal logging** | Yes | Text always works; voice/photo need Bedrock |
| **Nutrition lookup** | Yes | Act → USDA when `nova-act` installed; otherwise web grounding or estimated fallback |
| **Grocery Act** | `nova-act` + profile | Without: returns demo results; add-to-cart needs Amazon login setup |
| **Nova Reel (video)** | S3 bucket | Set `NOVA_REEL_S3_BUCKET` for live generation; without it, returns demo video fallback |
| **Transformation preview** | Bedrock + Nova Canvas | Upload photo → generate "after" image |
| **DynamoDB sync** | Optional | App works with localStorage only; table needed for cross-device sync |
| **Judge reliability mode** | Yes | Set `JUDGE_MODE=true` to force deterministic fallback for optional integrations and use `/api/judge/health` to verify status |
| **Web grounding** | IAM + US CRIS profile | Requires `bedrock:InvokeTool` on `arn:aws:bedrock::{account}:system-tool/amazon.nova_grounding`; uses `us.amazon.nova-2-lite-v1:0` by default. Falls back to Nova Lite if unavailable. |

**Web grounding IAM:** Add this statement to your IAM policy (replace `526015377909` with your AWS account ID):

```json
{
  "Effect": "Allow",
  "Action": ["bedrock:InvokeTool"],
  "Resource": ["arn:aws:bedrock:526015377909:system-tool/amazon.nova_grounding"]
}
```

**Amazon login for add-to-cart:** To add grocery items to your Amazon cart, Nova Act needs a persisted browser profile with your login. One-time setup:

```bash
# Nova Act API key required (get from nova.amazon.com/act → Dev Tools)
export NOVA_ACT_API_KEY=your-key-here

# Create profile dir and log in (browser will open)
export NOVA_ACT_USER_DATA_DIR=~/nova-act-amazon-profile
python3 scripts/setup_amazon_login.py
# Log into Amazon in the browser, then press Enter

# Add to .env so the app reuses the profile
echo "NOVA_ACT_USER_DATA_DIR=$HOME/nova-act-amazon-profile" >> .env
```

## Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Tests

```bash
npm test            # run once
npm run test:watch  # watch mode
```

## Deployment (Vercel)

```bash
# First time: install and log in
npm install -g vercel
vercel login

# Deploy to production
vercel --prod
```

Set environment variables in the [Vercel dashboard](https://vercel.com/dashboard) → Project → Settings → Environment Variables:

- `AWS_REGION` (e.g. `us-east-1`)
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- Optionally: `DYNAMODB_TABLE_NAME`, `NOVA_REEL_S3_BUCKET`

Add the deployment URL to your Devpost submission and to the Judge Access section above.

### Scalability & Cost

- **Serverless**: Next.js API routes run on Vercel (60s Hobby, 300s Pro). Plan generation and weekly review may take 30–60s; Pro recommended for demos.
- **Bedrock costs**: Nova Lite, Sonic, Canvas, Reel billed per token/image/video. Typical: ~$0.01–0.05 per plan, ~$0.001 per meal suggestion.
- **DynamoDB**: On-demand capacity; set billing alarms.
- **Troubleshooting**: AI 401 → unset `REQUIRE_AUTH_FOR_AI` or use "Try pre-seeded demo". Plan/voice disabled → configure AWS credentials. Without credentials → `JUDGE_MODE=true` for fallbacks.

### Performance Benchmarks

Measured on Vercel Pro (us-east-1), Nova 2 Lite, typical payloads:

| Operation | Latency | Notes |
|-----------|---------|-------|
| **Plan generation** (extended thinking) | 15–45s | Depends on profile complexity; extended thinking adds ~10s |
| **Meal suggestion** | 2–4s | Single Nova Lite call |
| **Photo analysis** (plate → macros) | 3–6s | Image upload + Nova Lite vision |
| **Receipt scanning** | 4–8s | Multi-item extraction |
| **Voice parse** (transcript → macros) | 1–3s | Text-only Nova Lite call |
| **Reco AI coach** (text) | 2–5s | Context-aware single turn |
| **Reco voice** (Nova Sonic streaming) | <1s first token | Bidirectional streaming; latency = time-to-first-audio |
| **Weekly review** (multi-agent) | 20–60s | 3–4 agent rounds with tool calls; wearable + web research adds time |
| **Nova Canvas** (image generation) | 8–15s | Single image |
| **Nova Act** (grocery search) | 30–90s | Browser automation; Railway cold start adds ~15s |
| **Dashboard load** (hydrated) | <200ms | localStorage primary; server sync in background |

**Vercel Hobby vs Pro:** Plan generation and weekly review may timeout on Hobby tier (60s limit). Pro tier (300s limit) recommended for demos. `maxDuration = 60` configured on long-running routes.

## Amazon Nova Integration — All 8 Features

Recomp integrates the full Amazon Nova portfolio:

| # | Feature | Model/Service | Where |
|---|---------|---------------|-------|
| 1 | **Nova 2 Sonic (Voice)** | `amazon.nova-sonic-v1:0` | Reco chat — real-time bidirectional streaming: audio chunks stream to Bedrock during recording, response text/audio streamed back. Voice meal logging in Meals tab. |
| 2 | **Multimodal Embeddings** | `amazon.nova-2-multimodal-embeddings-v1:0` | Nova Labs — embed text for similarity/RAG |
| 3 | **Nova 2 Lite Image Input** | `amazon.nova-2-lite-v1:0` | Snap plate in Meals → photo analysis & macro estimates. Receipt scanning → grocery item extraction. |
| 4 | **Web Grounding** | Nova 2 Lite + `nova_grounding` | `/api/research` — search web for nutrition/fitness info. Used by weekly review agent. |
| 5 | **Nova Canvas** | `amazon.nova-canvas-v1:0` | Nova Labs — generate meal/workout inspiration images |
| 6 | **Nova Reel** | `amazon.nova-reel-v1:1` | Nova Labs — generate 6s exercise demo videos (requires S3) |
| 7 | **Extended Thinking** | Nova 2 Lite reasoning config | Plan generation uses high reasoning effort |
| 8 | **Nova Act** | Nova Act SDK (Python) | Nova Labs — browser automation for grocery search & USDA nutrition lookup. Demo-mode fallback when SDK not installed. |

### Agentic Architecture

The weekly review uses a **multi-agent orchestration** pattern:

- **Coordinator Agent** — Routes tasks and synthesizes the final review
- **Meal Analysis Agent** — Analyzes meal patterns, macro adherence, consistency
- **Wellness Agent** — Reviews wearable data (sleep, activity, heart rate trends) and researches current guidelines via web grounding
- **Synthesis Agent** — Generates actionable recommendations from all agent outputs

Each agent uses Nova 2 Lite Converse API with tool use. The coordinator orchestrates up to 5 rounds of tool calls before producing the final review.

### Wearables

| Device | Method |
|--------|--------|
| **Oura Ring** | Personal Access Token from cloud.ouraring.com |
| **Fitbit** | OAuth (set `FITBIT_CLIENT_ID`, `FITBIT_CLIENT_SECRET`) |
| **Apple Watch** | HealthKit SDK bridge sync (iOS companion) or JSON import |
| **Android / Health Connect** | Import export, or use Fitbit if your watch syncs there |
| **Garmin** | Garmin Health API (developer approval required) — import supported |

### Cooking & Nutrition App Integrations

| App | Method |
|-----|--------|
| **Cronometer** | JSON/CSV export → Import, or webhook |
| **MyFitnessPal** | CSV diary export → Import, or webhook |
| **Yummly** | Webhook integration |
| **Whisk** | Webhook integration |
| **Mealime** | JSON export → Import |
| **Paprika** | Recipe export → Import |
| **LoseIt** | CSV export → Import |
| **Custom** | Any app via webhook (HMAC-SHA256) or paste/upload |

Cooking app data is parsed by Nova AI to extract meal names, macro breakdowns (calories, protein, carbs, fat, fiber, sugar, sodium), and recipe metadata. Set `COOKING_WEBHOOK_SECRET` for server-to-server integrations.

### API Routes

**Auth & Data**
| Route | Method | Description |
|-------|--------|-------------|
| `/api/auth/register` | POST | Create user profile, set auth cookie |
| `/api/auth/me` | GET | Auth status (`authenticated`, `profile`). Used for demo-mode detection. |
| `/api/data/sync` | POST | Sync localStorage to DynamoDB |

**Plans**
| Route | Method | Description |
|-------|--------|-------------|
| `/api/plans/generate` | POST | Generate diet + workout plan (extended thinking) |
| `/api/plans/adjust` | POST | Dynamic plan adjustments |

**Meals**
| Route | Method | Description |
|-------|--------|-------------|
| `/api/meals/suggest` | POST | AI meal suggestions |
| `/api/meals/analyze-photo` | POST | Photo → macro estimates (Nova Lite image) |
| `/api/meals/analyze-receipt` | POST | Receipt image → grocery items + nutrition |
| `/api/meals/lookup-nutrition-web` | POST | Web grounding fallback for nutrition when Act unavailable |

**Voice**
| Route | Method | Description |
|-------|--------|-------------|
| `/api/voice/parse` | POST | Parse spoken meal → structured data (Nova Lite) |
| `/api/voice/sonic` | POST | Nova Sonic voice conversation (single turn) |
| `/api/voice/sonic/stream` | POST | Bidirectional streaming voice (Reco + meal logging) |

**AI Coach & Agents**
| Route | Method | Description |
|-------|--------|-------------|
| `/api/rico` | POST | Reco AI coach text conversation |
| `/api/agent/weekly-review` | POST | Multi-agent autonomous weekly analysis |

**Nova Labs**
| Route | Method | Description |
|-------|--------|-------------|
| `/api/images/generate` | POST | Nova Canvas image generation |
| `/api/images/after` | POST | AI "after" image from full-body photo + goal (transformation preview) |
| `/api/video/generate` | POST | Nova Reel video generation (S3 for live; demo fallback when unconfigured) |
| `/api/embeddings` | POST | Nova Multimodal Embeddings |
| `/api/research` | POST | Web grounding for nutrition/fitness info |

**Nova Act**
| Route | Method | Description |
|-------|--------|-------------|
| `/api/act/grocery` | POST | Grocery search automation (demo-mode fallback) |
| `/api/act/nutrition` | POST | USDA nutrition lookup automation |
| `/api/act/sync` | POST | Act feature status and capabilities |

**Cooking App Integrations**
| Route | Method | Description |
|-------|--------|-------------|
| `/api/cooking/connect` | POST/DELETE | Connect or disconnect a cooking/nutrition app |
| `/api/cooking/webhook` | POST | Receive meal data via webhook (HMAC-signed) |
| `/api/cooking/import` | POST | Import CSV/JSON/text exports (Nova AI parsing) |

**Wearables**
| Route | Method | Description |
|-------|--------|-------------|
| `/api/wearables/oura/connect` | POST | Connect Oura Ring |
| `/api/wearables/oura/data` | GET | Fetch Oura data |
| `/api/wearables/oura/disconnect` | POST | Disconnect Oura |
| `/api/wearables/fitbit/auth` | GET | Fitbit OAuth flow |
| `/api/wearables/fitbit/callback` | GET | Fitbit OAuth callback |
| `/api/wearables/fitbit/data` | GET | Fetch Fitbit data |
| `/api/wearables/fitbit/disconnect` | POST | Disconnect Fitbit |
| `/api/wearables/apple/healthkit` | POST | Apple HealthKit SDK ingest bridge |
| `/api/wearables/health/import` | POST | Health Connect / generic health data import |

**Architecture:** See [ARCHITECTURE.md](./ARCHITECTURE.md) for system diagrams and data flow.

### Project Structure

```
src/
├── app/
│   ├── page.tsx           # Main app shell, routing, state
│   └── api/               # API routes
├── components/
│   ├── LandingPage.tsx    # Onboarding form
│   ├── Dashboard.tsx      # Caloric budget, diet/workout preview, weekly review
│   ├── MealsView.tsx      # Meal logging, voice/photo/receipt, cooking sync
│   ├── WorkoutPlannerView.tsx
│   ├── ProfileView.tsx
│   ├── WearablesView.tsx
│   ├── AdjustView.tsx
│   ├── MilestonesView.tsx
│   └── RicoChat.tsx
└── lib/
    ├── types.ts
    ├── storage.ts         # localStorage + DynamoDB sync
    ├── logger.ts          # Structured logging for API routes
    └── ...
```

### Security

- **Rate limiting** on all API routes (fixed-window, in-memory). *Note:* On serverless (Vercel), limits are per-instance; for production consider Redis/Upstash for shared limits.
- **Zod schema validation** on registration and voice input
- **Cookie-based auth** (httpOnly `recomp_uid` cookie)
- **Input sanitization** on AI context payloads
- **Error boundaries** and graceful fallbacks throughout

## Hackathon Category

**Freestyle** (recommended) — Recomp integrates all 8 Nova features in one cohesive app. Breadth of integration is the differentiator.

**Agentic AI** (alternative) — The weekly review uses a multi-agent orchestration pattern where a coordinator delegates to specialist agents (meal analyst, wellness, synthesizer), each using Nova tool-use to autonomously gather and analyze data.

## License

MIT
