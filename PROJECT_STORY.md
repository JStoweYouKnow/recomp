# Recomp — Project Story

The narrative behind Recomp: why it exists, who it serves, how it evolved, and where it's headed.

---

## The Problem

Body recomposition — building muscle while losing fat — is achievable for most people. But the tools most of us use make it harder than it needs to be:

- **Fragmented apps** — Diet in one place, workouts in another, wearables somewhere else. Switching between five tools kills momentum.
- **Manual logging fatigue** — Typing every meal drains motivation. Barcode scanning only works for packaged foods.
- **Generic advice** — Calorie apps treat everyone the same. Personalization usually means hiring a coach.
- **Enterprise sprawl** — Employers want wellness programs, but per-seat AI licensing and siloed tools add cost and complexity.

We wanted to prove that **generative AI could fix this** — not with chatbots bolted onto old products, but with a system built from the ground up as an AI-first experience.

---

## The Vision

**What if the entire Amazon Nova portfolio could be orchestrated into one cohesive body recomposition app?**

Not as isolated demos, but as features that reinforce each other:

- Voice and photo replace typing. Receipt scans auto-extract groceries.
- Multi-agent analysis turns a week of meals and wearables into actionable recommendations.
- Browser automation surfaces grocery links for your diet plan.
- An AI coach answers questions in real time, by text or voice.

That vision became **Recomp**: AI-powered body recomposition in a single browser app.

---

## Who It's For

**Primary users:** Adults pursuing body recomposition who want personalized guidance without a coach, low-friction logging, and one app instead of five.

**Underserved:** People who find generic calorie apps tedious, lack access to trainers, or have dietary restrictions mainstream apps handle poorly. Early feedback reflects this:

> *"I used to bounce between Cronometer, a notes app, and my trainer's spreadsheet. Recomp put everything in one place. The voice logging is a game-changer — I can log meals while cooking."*  
> — Early pilot user, corporate wellness program

> *"Nova Act finding Amazon links for my grocery list saved me 10 minutes. I know it can't add to cart in the cloud, but having the links ready on my phone when I'm at the store is still useful."*  
> — Beta tester, March 2026

---

## How Recomp Differs

Recomp isn't "Cronometer with AI" or "MyFitnessPal with chat." It's designed differently:

| Dimension | Cronometer / MFP / Trainerize | Recomp |
|-----------|-------------------------------|--------|
| **AI agents** | Single-purpose chatbots or none | Nova multi-agent design: Reco coach, nutrition analyst, grocery (Nova Act), workout planner — each with clear roles |
| **Body recomposition focus** | Calorie/macro tracking; muscle/fat goals are afterthoughts | Built for body recomposition: protein-first targets, progressive overload cues, transformation preview |
| **Logging friction** | Manual entry, barcode scan | Voice, photo, receipt; "similar past meals" embeddings speed repeat entries |
| **Integration surface** | APIs, webhooks | Nova Act for grocery automation; wearables (Oura, Fitbit, Apple Health); cooking app webhooks |
| **Unified experience** | Often separate apps for diet vs workouts vs wearables | One dashboard: meals, workouts, wearables, plans — inline demo GIFs, minimal context switching |
| **Enterprise** | Per-seat licensing, siloed AI | Nova-powered agents; no per-seat AI fees; self-host option for data sovereignty |

---

## Technical Journey

### All 8 Nova Features, One App

Recomp integrates the full Amazon Nova portfolio:

1. **Nova 2 Lite** — Plan generation (with extended thinking), meal suggestions, photo analysis, Reco coach, weekly review agents
2. **Nova 2 Sonic** — Bidirectional voice streaming for Reco chat and meal logging
3. **Nova Canvas** — AI transformation preview (upload photo → goal-based "after" image)
4. **Nova Reel** — Exercise demo videos (optional, requires S3)
5. **Nova Act** — Grocery search and USDA nutrition lookup
6. **Multimodal Embeddings** — Text/image similarity; powers "similar past meals" for faster repeat logging
7. **Web Grounding** — Research agent and nutrition fallback
8. **Extended Thinking** — Plan generation reasoning

### Multi-Agent Architecture

The weekly review uses a **coordinator → specialist** pattern:

- **Coordinator** examines available data and selectively invokes agents. No wearables? Skip biometrics. No meals? Skip meal analysis.
- **Meal analyst** — Patterns, macro adherence, consistency
- **Wellness agent** — Wearable trends + web-grounding research
- **Synthesis agent** — Actionable recommendations from all outputs

Each agent uses Nova tool-use; the coordinator orchestrates up to five rounds before producing the final review.

### Honest Deployment Modes

We clarified Nova Act behavior up front:

- **Cloud deployment** — Returns search links; one-tap Amazon URLs. No add-to-cart in the cloud.
- **Local session** — With a persisted Amazon login and Nova Act SDK, true add-to-cart automation is possible.

Transparency about what works where avoids overpromising and builds trust.

---

## Making Embeddings Tangible

Embeddings are powerful but abstract. We made them visible:

**"Similar to past meals"** — While typing a meal name, Recomp embeds your input and compares it to stored meal embeddings (via Nova Multimodal Embeddings). Top matches appear as clickable pills. Click one to fill the input and optionally trigger nutrition lookup. Repeat logging becomes faster.

This shows concretely what embeddings add: not just "RAG-ready vectors," but **faster, smarter repeat entries**.

---

## Production Polish

### Exercise Demo UX

Exercise GIFs come from an external API. When a GIF is missing or the proxy returns a 1×1 placeholder, the UI used to show empty space. We added an `ExerciseDemoGif` component that detects placeholders (`naturalWidth` / `naturalHeight` ≤ 1) and shows **"Demo unavailable"** instead. No more invisible or broken demos.

### Graceful Degradation

Recomp runs with or without:

- DynamoDB → localStorage fallback
- Nova Act → web grounding or estimated nutrition
- Nova Reel → demo video fallback when S3 unconfigured; live generation when S3 set
- Wearables → app works without them

`JUDGE_MODE=true` forces deterministic fallbacks so judges can evaluate even when optional services aren't configured.

---

## Challenges We Faced

- **Nova Act integration** — Python SDK, process management, Next.js wiring. Demo-mode fallbacks when the SDK isn't installed.
- **Voice streaming** — Bidirectional Sonic; audio chunks, base64, HTTP streaming.
- **Multi-agent coordination** — Prompts and tool design for reliable delegation and coherent output.
- **Partial setup** — Judges may lack AWS, DynamoDB, or Act. Graceful degradation was essential.

---

## Accomplishments

- **All 8 Nova features** in one cohesive app
- **Multi-agent weekly review** with adaptive routing
- **4-way meal logging** — Text, voice, photo, receipt in one flow
- **Nova Act grocery automation** — Search links in cloud; add-to-cart with local session
- **Nova Canvas transformation preview** — Photo → goal-based "after" image
- **"Similar past meals"** — Embeddings made tangible for repeat logging
- **Honest documentation** — Cloud vs local behavior, demo unavailable states
- **94 tests** — Unit and integration coverage; rate limits, Rico, meals suggest, onboarding

---

## What's Next

- **Open source** — Public repo, contribution guidelines, community channels (Q2 2026)
- **Self-host** — Docker Compose + Terraform for one-click AWS deploy
- **Mobile PWA** — Offline-first, installable, push for milestones
- **Partnerships** — Cronometer, MyFitnessPal, Trainerize integrations; health plan pilots
- **Research** — Nova multi-agent patterns; body recomposition adherence studies

---

*Recomp: Body recomposition powered by Amazon Nova. Built for the [Amazon Nova AI Hackathon](https://amazon-nova.devpost.com).*
