# API Structure

Domain separation and layer organization for the Recomp API.

---

## Layer Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Route Handlers (src/app/api/**/route.ts)               │
│  • HTTP: parse body, auth, rate limit, validate          │
│  • Delegate to services                                  │
│  • Return JSON                                           │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│  Services (src/lib/services/*.ts)                        │
│  • Business logic, Nova invocation, data transforms      │
│  • No request/response concerns                          │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│  Lib / Infrastructure (src/lib/*.ts)                     │
│  • nova.ts, db.ts, storage.ts, act-service.ts            │
│  • Shared utilities                                      │
└─────────────────────────────────────────────────────────┘
```

---

## Domain Map

| Domain | Routes | Service Module | Responsibility |
|--------|--------|----------------|----------------|
| **Auth** | auth/register, auth/demo, auth/me | — | Registration, demo login, session |
| **Plans** | plans/generate, plans/adjust | — | Plan generation (Nova Lite + extended thinking), adjustment |
| **Meals** | meals/suggest, meals/analyze-photo, meals/analyze-receipt, … | services/meals.ts | Meal suggestions, photo/receipt analysis |
| **Body Scan** | body-scan/analyze, body-scan/progress-reel | services/body-scan.ts | Scan analysis, progress reel |
| **Workouts** | workouts/recovery-adjust | services/workouts.ts | Recovery assessment |
| **AI Agent** | agent/weekly-review | — | Multi-agent weekly review (Nova Lite tool use) |
| **Reco** | rico | — | Chat, delegates to nova |
| **Research** | research | services/research.ts | Web grounding |
| **Act** | act/grocery, act/nutrition, act/sync | act-service.ts, act-client.ts | Grocery, nutrition via Act SDK |
| **Voice** | voice/parse, voice/sonic, voice/sonic/stream | — | Voice parsing, Sonic streaming |
| **Media** | images/generate, images/after, video/generate | nova.ts (Canvas, Reel) | Image/video generation |
| **Groups** | groups/*, challenges/* | db.ts | Groups, messages, challenges |
| **Wearables** | wearables/* | db.ts, external APIs | Oura, Fitbit, Health |
| **Infra** | judge/health, data/sync, push/*, calendar/* | judgeMode, db, push | Health check, sync, push, calendar |

---

## Shared Concerns

- **Auth:** `getUserId()` from `@/lib/auth` — used in protected routes
- **Rate limit:** `fixedWindowRateLimit()` from `@/lib/server-rate-limit`
- **Errors:** `api-response.ts` helpers for consistent `{ error, code?, detail? }`
- **Validation:** Zod schemas in route handlers before calling services

---

## Migration Status

Routes are being refactored to use services. Currently:
- `services/meals.ts` — `suggestMeals()`, `suggestMealsFromNova()` used by meals/suggest
- `services/body-scan.ts` — `startProgressReel()`, `pollProgressReel()` used by body-scan/progress-reel
- `services/research.ts` — `researchQuery()` used by research
- `services/workouts.ts` — `assessRecovery()` used by workouts/recovery-adjust

Existing routes remain functional; services are introduced incrementally.
