# About the project

## Inspiration

Fitness and nutrition apps are fragmented — one for meal logging, another for workouts, a third for wearables. Most are either expensive, require tedious manual entry, or offer generic advice. We wanted a single app that feels like having a personal coach: voice-powered meal logging, AI plans that adapt to you, and an agent that actually analyzes your week instead of just showing charts.

Body recomposition (building muscle while losing fat) is achievable for most people, but it demands consistency and personalization. Recomp makes that accessible with Amazon Nova — no gym membership, no trainer fees, just a browser.

## What it does

Recomp is an AI-powered body recomposition app that runs entirely in the browser. Users complete onboarding (age, goals, restrictions), and Nova Lite generates a personalized diet and workout plan. A **unified calendar** on the dashboard, Meals, and Workouts tabs lets them jump to any date: the dashboard shows "Today at a Glance" (caloric budget, macros, today’s workout and diet) and a weekly calendar with popup cards; selecting a date on Meals or Workouts filters to that day, and workout cards can show **inline exercise demo GIFs** (show/hide per exercise). They log meals four ways: **text**, **voice** (Nova Sonic), **photo** (Nova Lite vision), or **receipt scan**. A dynamic caloric budget adjusts in real time — log activity to earn calories, sedentary time to deduct. The **Reco** AI coach answers questions via text or voice. A **multi-agent weekly review** coordinates meal analysis, wearable trends, and web research into actionable recommendations. Nova Act can search Amazon Fresh for diet-plan groceries and add to cart. Nova Canvas powers an AI transformation preview — upload a full-body photo and see a goal-based "after" image.

## How we built it

We used **Next.js 16** (App Router, React 19) for the frontend and API routes. All AI runs on **Amazon Nova on Bedrock**: Nova 2 Lite (plans, meal suggestions, photo analysis, Reco coach, weekly review agents), Nova 2 Sonic (bidirectional voice for chat and meal logging), Nova Canvas (images), Nova Reel (video), Nova Act (grocery/nutrition automation), multimodal embeddings, and web grounding. We store user data in **DynamoDB** (single-table design) with cookie-based auth, falling back to localStorage for demo mode and offline support. The weekly review uses a multi-agent orchestration pattern: a coordinator delegates to meal analyst and wellness agents, each with tool use, running 3–5 rounds before synthesis. TypeScript, Tailwind CSS v4, Zod validation, and 70+ Vitest tests round out the stack.

## Challenges we ran into

- **Nova Act integration**: The Act SDK runs as a Python subprocess; wiring it to Next.js API routes required careful process management and demo-mode fallbacks when the SDK isn't installed.
- **Voice streaming**: Bidirectional Nova Sonic streaming (user speaks while the model responds) needed robust handling of audio chunks, base64 encoding, and WebSocket-style flows over HTTP.
- **Multi-agent coordination**: Getting the weekly review agents to reliably delegate, share context, and produce a coherent final output took several prompt and tool-design iterations.
- **Partial setup**: Judges may run without full AWS, DynamoDB, or Act. We built graceful fallbacks (localStorage, web grounding for nutrition, fuzzy food matching) so the app stays usable.

## Accomplishments that we're proud of

- **All 8 Nova features** integrated in one cohesive app: Sonic, Lite, Canvas, Reel, Act, embeddings, web grounding, extended thinking.
- **4-way meal logging** in a single flow — no app switching.
- **Dynamic caloric budget** that adapts to activity instead of a rigid daily target.
- **AI transformation preview** using body segmentation and Nova Canvas for goal-based "after" images.
- **Multi-agent weekly review** with real tool use and web grounding.
- **Unified calendar** — One calendar on dashboard, Meals, and Workouts; date-based filtering and single-day workout view; "Edit plan" from calendar popups to jump into editing.
- **Exercise demo GIFs** — Inline demos with target-muscle info on dashboard and Workouts tab; show/hide per exercise with correct state.
- **Demo mode** that lets anyone try the full app without auth or server setup.
- **70+ tests** including integration tests for onboarding, Rico, and meals flows.

## What we learned

We learned how to orchestrate multiple Nova models in one request flow, how to design prompts for agentic tool use, and how to structure fallbacks so the app degrades gracefully when optional services (Act, DynamoDB, S3) aren't configured. We also saw how powerful voice + vision + text multimodal input is for lowering friction in meal logging.

## What's next for Recomp

- **Open source** the project with contribution guidelines and community channels.
- **Self-host option** — Docker Compose + Terraform for one-click AWS deploy.
- **Mobile PWA** — offline-first, installable, with push notifications for milestones.
- **Integrations** with Cronometer, MyFitnessPal, and health plan pilots.
- **Research** on Nova multi-agent patterns and body recomposition adherence.
