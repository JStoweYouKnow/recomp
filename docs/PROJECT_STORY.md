# Refactor — Project Story

**Refactor** is an AI-powered body recomposition app built on the full Amazon Nova portfolio. It demonstrates how eight Nova capabilities—from text and voice to vision, web grounding, and browser automation—can be composed into a single, cohesive fitness experience.

---

## The Problem

Most fitness apps either lock users into manual data entry or rely on a single AI model for narrow tasks. Users juggle multiple tools: one app for meal tracking, another for workouts, a third for nutrition lookup, and often a subscription for AI coaching. There’s no unified experience that adapts to how people actually live and log—by speaking, snapping a photo, or scanning a receipt.

Enterprises face similar fragmentation: wearable data, nutrition APIs, and coaching tools rarely integrate cleanly. Corporate wellness programs struggle to offer a single interface that surfaces sleep, activity, meal adherence, and AI-driven insights in one place.

---

## The Vision

Refactor treats Nova not as a text generator but as an **AI operating system**. The right capability is invoked for each task:

- **Voice** for conversational onboarding and meal logging (Nova Sonic)
- **Vision** for plate photos and receipt scans (Nova Lite)
- **Web grounding** for evidence-based research and nutrition fallbacks
- **Act** for grocery search and USDA-backed nutrition via browser automation
- **Extended thinking** for complex, personalized plan generation
- **Canvas** for transformation previews and meal inspiration
- **Reel** for progress videos from body scans
- **Embeddings** for similar-meal suggestions and one-tap re-logging

The result is a production-grade app that removes friction at every step: set up your profile by voice, log meals by snapping or speaking, get grocery links with one tap, and receive a multi-agent weekly review that adapts to what data you actually have.

---

## How It Works

### Architecture

Refactor runs as a Next.js app on Vercel, with API routes calling Amazon Bedrock (Nova models) and an optional Nova Act Python service for browser automation. Data is stored in DynamoDB with a single-table design; localStorage acts as a local cache for offline-first behavior.

### User Flow

1. **Onboarding** — Users fill a form or complete a voice conversation with Nova Sonic. The AI extracts profile data (name, age, goals, equipment, restrictions) and generates a personalized diet and workout plan via Nova Lite with extended thinking.

2. **Dashboard** — “Today at a Glance” shows caloric budget, macros, today’s workout and meals. A unified calendar spans diet and workouts; users can edit plans from calendar popups. Wearable data (Oura, Fitbit, Apple Health) surfaces sleep and readiness. An AI transformation preview lets users upload a photo and see a goal-based “after” image via Nova Canvas.

3. **Meal Logging (4 Ways)** — Text, voice (Nova Sonic), photo analysis (Nova Lite vision), and receipt scanning in one flow. Nutrition comes from Nova Act, web grounding, Open Food Facts, or estimates. Similar-meal embeddings power one-tap re-logging.

4. **The Ref AI Coach** — A conversational coach (The Ref) with text and bidirectional voice (Nova Sonic). Users can chat or hold the mic for real-time streaming. The coach adapts to context and can deliver “wake-up calls” when check-in patterns suggest the user needs a nudge.

5. **Weekly Review** — A multi-agent coordinator examines meals, wearables, and research needs. It selectively invokes specialist agents (meal analyst, wellness, web research) based on available data. No wearable data? Skips biometrics, runs research-only. This is genuinely agentic behavior, not a static pipeline.

6. **Plan Adjustments** — Users provide feedback on the plan; Nova Lite suggests calorie, macro, and workout changes. Grocery search via Nova Act returns one-tap Amazon links for plan-aligned ingredients.

### Production Features

- **Request logging** — CloudWatch-compatible JSON with duration, model, and errors
- **Rate limiting** — Upstash Redis (or in-memory fallback) with standard headers
- **Graceful degradation** — Act unavailable? Grocery falls back to search links; nutrition to estimates. Reel unavailable? Clear messaging.
- **Responsible AI** — Image disclaimers, nutrition source attribution, no silent failures
- **DynamoDB sync** — Optional multi-device persistence with GSI1 for flexible queries

---

## What Makes Refactor Novel

| Aspect | Refactor |
|--------|----------|
| **Agentic AI** | Weekly review coordinator dynamically routes to specialist agents based on data availability |
| **Multimodal** | Text, voice, images, receipts, video in one app |
| **4-way meal logging** | Competitors typically offer 1–2; Refactor unifies text, voice, photo, receipt in one flow |
| **Full Nova stack** | 8 Nova features composed, not just one model for text |
| **Voice-first onboarding** | Optional voice conversation instead of a long form |
| **Web grounding** | Inline nutrition research with cited sources |
| **Browser automation** | Nova Act for grocery and nutrition (separate Python service) |
| **Dynamic caloric budget** | Adjusts with activity and sedentary time, not a fixed target |

---

## Impact

**Community:** No subscription wall for core features. Voice and photo logging reduce barriers for users who dislike manual entry. Web grounding and Act deliver USDA-backed nutrition without separate apps.

**Enterprise:** Wearable aggregation (Oura, Fitbit, Apple Health), single DynamoDB table for multi-device sync, ICS calendar feed for workout plans. No per-user licensing from third-party nutrition APIs.

**Technical:** Demonstrates Nova as a full-stack AI platform—routing, tool-use loops, streaming voice, vision, and automation in a production-ready Next.js app.

---

## Tech Stack

- **Frontend:** Next.js 16, React 19
- **Backend:** Next.js API routes, Vercel serverless
- **AI:** Amazon Bedrock (Nova Lite, Sonic, Canvas, Reel), Nova Act (Python service on Railway/Render)
- **Data:** DynamoDB (optional), localStorage (primary cache)
- **Auth:** Cookie-based (`recomp_uid`), optional registration
- **Rate limiting:** Upstash Redis
- **Deployment:** Vercel (Next.js), Railway/Render (Act service)

---

## Roadmap

- Beta cohort for real-user feedback
- Enterprise pilot: corporate wellness integration
- Mobile PWA with native push
- Community health challenges (Groups)

---

*Built for the [Amazon Nova AI Hackathon](https://amazon.nova.devpost.com). Repository: [github.com/JStoweYouKnow/recomp](https://github.com/JStoweYouKnow/recomp). Live demo: [recomp-one.vercel.app](https://recomp-one.vercel.app).*
