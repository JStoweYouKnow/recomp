# About the project

## Inspiration

We wanted to answer: **what happens when you orchestrate the entire Amazon Nova portfolio — voice, vision, agents, automation, embeddings, and grounding — into one cohesive application?** Not as isolated demos, but as a real product where features reinforce each other.

Fitness and nutrition was the ideal domain: it demands multimodal input (voice, photos, receipts), agentic reasoning (analyzing a week of data across multiple dimensions), browser automation (grocery shopping), and personalized generation (plans, coaching). Most fitness apps are fragmented, expensive, or generic. Recomp shows that Nova can be a full-stack AI platform.

Body recomposition (building muscle while losing fat) is achievable for most people, but demands consistency and personalization. Recomp makes that accessible with Amazon Nova — no gym membership, no trainer fees, just a browser.

## What it does

Recomp is an AI-powered body recomposition app that runs in the browser. Users complete onboarding (age, goals, restrictions), and Nova Lite generates a personalized diet and workout plan. A **unified calendar** on the dashboard, Meals, and Workouts tabs lets them jump to any date; the dashboard shows **Today at a Glance** (caloric budget, macros, today’s workout and diet) and a weekly calendar with popup cards. They log meals four ways: **text**, **voice** (Nova Sonic), **photo** (Nova Lite vision), or **receipt scan**. A dynamic caloric budget adjusts in real time. The **Reco** AI coach answers via text or voice. A **multi-agent weekly review** coordinates meal analysis, wearable trends, and web research into actionable recommendations.

**Three standout Nova innovations:**

1. **Nova Act grocery automation** — Search Amazon Fresh/Whole Foods for diet-plan ingredients and add to cart. End-to-end UI automation; no other fitness app does this with Nova Act.

2. **Multi-agent weekly review** — A coordinator agent delegates to specialist agents (meal analyst, wellness, research). Each uses Nova tool use; the coordinator synthesizes a final review. Adaptive: no wearables? Skip biometrics. No meals? Skip meal analysis. True agentic orchestration.

3. **Nova Canvas transformation preview** — Upload a full-body photo; Nova Canvas generates an "after" image based on your goal. Body segmentation ensures clean compositing. A powerful motivation tool.

## How we built it

**Tech stack:** Next.js 16 (App Router, React 19), Amazon Nova on Bedrock — Nova 2 Lite (plans, meal suggestions, photo analysis, Reco coach, weekly review agents), Nova 2 Sonic (bidirectional voice for chat and meal logging), Nova Canvas (images, transformation preview), Nova Reel (video), Nova Act (grocery/nutrition automation), multimodal embeddings, and web grounding. DynamoDB for persistence (single-table), cookie-based auth, localStorage fallback for demo mode.

The weekly review uses a **multi-agent orchestration pattern**: a coordinator delegates to meal analyst and wellness agents; each runs Converse tool-use loops. The coordinator examines available data and selectively invokes specialists — dynamic routing, not hardcoded pipelines.

## Challenges we ran into

- **Nova Act integration** — The Act SDK runs as a Python subprocess; wiring it to Next.js API routes required process management and demo-mode fallbacks when the SDK isn't installed.
- **Voice streaming** — Bidirectional Nova Sonic streaming (user speaks while the model responds) needed robust handling of audio chunks, base64 encoding, and HTTP streaming.
- **Multi-agent coordination** — Getting the weekly review agents to reliably delegate, share context, and produce coherent output took several prompt and tool-design iterations.
- **Partial setup** — Judges may run without full AWS, DynamoDB, or Act. We built graceful fallbacks (localStorage, web grounding for nutrition, fuzzy food matching) so the app stays usable.

## Accomplishments that we're proud of

- **All 8 Nova features** in one cohesive app — voice feeds into text analysis, photos feed into nutrition lookup, agents use web grounding autonomously.
- **Nova Act grocery automation** — Full end-to-end browser automation for diet-plan shopping on Amazon Fresh/Whole Foods.
- **Multi-agent weekly review** — Coordinator + meal analyst + wellness agent with adaptive routing based on data availability.
- **Nova Canvas transformation preview** — Upload photo → goal-based "after" image; unique use of image generation for motivation.
- **4-way meal logging** — Text, voice (Nova Sonic), photo, receipt scan in a single flow.
- **Evidence & Results section** — Dashboard card showing sample outcomes (macro adherence, weekly score, streak) from the pre-seeded demo.
- **70+ unit/integration tests** and WCAG accessibility.

## What we learned

We learned how to orchestrate multiple Nova models in one flow, design prompts for agentic tool use, and structure fallbacks so the app degrades gracefully when optional services (Act, DynamoDB, S3) aren't configured. Voice + vision + text multimodal input dramatically lowers friction in meal logging.

## What's next for Recomp

- **Open source** with contribution guidelines and community channels.
- **Self-host option** — Docker Compose + Terraform for one-click AWS deploy.
- **Mobile PWA** — offline-first, installable, push notifications for milestones.
- **Integrations** with Cronometer, MyFitnessPal, and health plan pilots.
- **Research** on Nova multi-agent patterns and body recomposition adherence.
