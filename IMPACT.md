# Impact & Evidence

Evidence for enterprise and community impact claims. Judges: see this document alongside the README.

---

## Methodology

- **Demo data:** Pre-seeded "Jordan" user (7-day synthetic dataset) demonstrates measurable outcomes without weeks of real usage. Click "Try pre-seeded demo" → "Show metrics" in the Evidence card.
- **Metrics:** Macro adherence %, weekly AI score, meal count, streak — all derivable from stored meals and plan targets.

---

## Community Impact

### Accessibility

- **No subscription wall:** Core features (plans, meals, Reco coach, weekly review) work without payment.
- **Voice + photo logging:** Nova Sonic and Nova Lite reduce friction for users who dislike manual entry. Log a meal in seconds by speaking or snapping.
- **Multimodal embeddings:** "Similar meals" (one-tap re-log) powered by embeddings reduces repeated typing.
- **Web grounding + Act:** USDA-backed nutrition and grocery links without separate nutrition apps or Amazon manual search.
- **WCAG-aligned UI:** Skip navigation link, `<main>` landmark, `focus-visible` outlines on all interactive elements, `prefers-reduced-motion` media query disables animations, `forced-colors` (high contrast) support for progress bars. All form inputs have associated labels.
- **Responsible AI:** AI-generated images carry "for inspiration only" disclaimers. Nutrition sources (USDA, Open Food Facts, estimated) are surfaced to users. All AI features degrade gracefully with informative fallbacks.

### Adoption path

- **Open source:** Repo is public. Self-host instructions in README.
- **PWA-ready:** Works offline; localStorage-first; service worker for push.
- **Planned:** Freemium tier, mobile PWA optimization, enterprise licensing for wellness programs.

---

## Enterprise Impact

### Single integration surface

- **Wearable aggregation:** Oura, Fitbit, Apple Health, Health Connect — one API for sleep, activity, readiness. No per-user licensing from third-party nutrition APIs.
- **DynamoDB sync:** Multi-device and team deployments supported. Corporate wellness dashboards can query a single table.
- **Calendar feed:** ICS subscription for workout plans; integrates with Outlook, Google Calendar, Apple Calendar.

### Cost efficiency

- **Serverless:** Next.js on Vercel; no always-on servers.
- **Bedrock pay-per-use:** Plan generation, meal suggestions, voice — billed per token. No fixed model hosting.
- **Act service:** Optional; app degrades to search links when unavailable.

### Production readiness

- **Structured logging:** CloudWatch-compatible JSON logs in production (human-readable in dev). Request duration, model name, token counts, and error stacks are captured per route. `withRequestLogging()` wrapper available for automatic duration + error logging.
- **Rate limiting:** Fixed-window rate limits on all AI routes with Upstash Redis (or in-memory fallback). Rate limit headers (X-RateLimit-Limit, Remaining, Reset) returned on every response.
- **Modular architecture:** MealsView decomposed into focused sub-components (CookingAppSync, MealList, PantrySection, MealPrepSection). Strict TypeScript with Zod validation on all API inputs. 203 test files across unit, integration, and E2E layers.

---

## Validation checklist (judges)

| Claim | How to verify | API (optional) |
|-------|---------------|----------------|
| 87% macro adherence | Try pre-seeded demo → Evidence card → Show metrics | — |
| 7/10 weekly AI score | Same; or run Weekly Review after logging meals | — |
| 4-way meal logging | Meals → Log meal → try text, Voice log, Snap plate, receipt | POST /api/meals/analyze-photo, /api/voice/parse |
| Nova Act grocery | Shopping list → search; check for Amazon product links | GET /api/act/status → reachable |
| Web grounding research | Dashboard → Research card → ask nutrition question; response should cite `source: web-grounding` | POST /api/research |
| Voice coach | Reco (🧩) → hold mic; bidirectional Nova Sonic | POST /api/rico, /api/voice/sonic/stream |
| All integrations live | — | GET /api/judge/health → features all "live" |

---

## Beta feedback (placeholder)

*Post-hackathon: collect testimonials and case studies from beta users.*

| Metric | Target |
|--------|--------|
| Beta signups | 50+ |
| Retention (7-day) | 40%+ |
| Voice/photo log adoption | 30%+ of meal logs |
| NPS | 40+ |

---

## Roadmap (post-hackathon)

1. Beta cohort for real-user feedback and case studies
2. Enterprise pilot: corporate wellness integration
3. Mobile PWA with native push
4. Community health challenges (Groups feature)
