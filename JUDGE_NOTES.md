# Judge Notes — Novel Aspects

Quick reference for judges: what makes Refactor novel beyond typical fitness apps.

---

## 1. Dynamic agent routing (Agentic AI)

**What:** The weekly review coordinator inspects available data and selectively invokes specialist agents. No wearable data? Skips biometrics agent, runs research-only. No meals logged? Skips meal analysis.

**Why it matters:** Most multi-agent systems run a fixed pipeline. Refactor's coordinator uses tool-call rounds to adapt — genuinely agentic behavior rather than a static workflow.

**Where:** `src/app/api/agent/weekly-review/route.ts` — coordinator uses Nova Lite tool use to delegate to meal/wellness agents.

---

## 2. Full Nova portfolio composition

**What:** 8 Nova features in one app: Lite, Sonic, Canvas, Reel, Act, Embeddings, Web Grounding, Extended Thinking. Not just one model for text generation.

**Why it matters:** Demonstrates Nova as an AI operating system — routing to the right capability per task (voice for coach, vision for plates, Act for grocery, Reel for video).

**Where:** `ARCHITECTURE.md` — Nova Integration Summary table; `src/lib/nova.ts` for Lite/Sonic/Canvas/Reel; Act via `act-service/`.

---

## 3. 4-way meal logging in one flow

**What:** Text, voice (Nova Sonic), photo (Nova Lite vision), receipt scan — all in the same "Log a meal" UI. Competitors typically offer 1–2.

**Why it matters:** Reduces friction for different user preferences; one unified flow instead of separate tools.

**Where:** `MealsView` — single modal with tabs/sections for each input type.

---

## 4. Nova Canvas image generation

**What:** AI-generated meal inspiration, workout illustrations, and motivational images via Nova Canvas. Includes responsible AI disclosure ("AI-generated image — for inspiration only").

**Why it matters:** Demonstrates Nova Canvas in a practical context — users see what their meal or exercise looks like before committing, increasing engagement.

**Where:** Meals → Log meal → "Inspire" button; `/api/images/generate`.

---

## 5. Progress reel (Nova Reel)

**What:** ≥2 body scans → generate transformation video. Uses Nova Reel text-to-video with prompt derived from scan dates. Polls for completion; returns video URL.

**Why it matters:** Connects body scan tracking to video output; demonstrates async Reel workflow.

**Where:** Milestones → Body scan section; `/api/body-scan/progress-reel` (POST + GET ?jobId=).

---

## 6. Coach confrontations

**What:** When check-in tone is confrontational, user can acknowledge or trigger a "wake-up call" that appends to coach schedule. Patterns drive confrontation logic.

**Why it matters:** Goes beyond passive tips — AI can challenge the user when behavior warrants it.

**Where:** Dashboard → CoachCheckInCard; `/api/coach/confront`.

---

## 7. Research card (web grounding)

**What:** Inline nutrition/fitness questions with web-grounded answers. Nova searches current guidelines.

**Why it matters:** Evidence-based answers without leaving the app; differentiator from generic chatbot advice.

**Where:** Dashboard → Research card; `/api/research`.

---

## 8. Responsible AI practices

**What:** AI-generated images carry "AI-generated — for inspiration only" disclaimers. Nutrition estimates surface data sources (USDA, Open Food Facts). Coach recommendations include context-specific caveats. All AI features degrade gracefully (no silent failures).

**Why it matters:** Production-grade AI requires transparency. Users should understand what's AI-generated vs. verified data.

**Where:** MealsView (image disclaimer); nova.ts (error handling + fallback); weekly-review route (source attribution).

---

## Category alignment

| Category | Fit |
|----------|-----|
| Agentic AI | Strong — multi-agent weekly review with dynamic routing |
| Multimodal | Strong — text, voice, images, receipts, video |
| UI Automation | Partial — Nova Act via separate service; grocery + nutrition |
| Voice AI | Strong — Nova Sonic for coach and meal logging |
