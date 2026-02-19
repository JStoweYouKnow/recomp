# How Recomp Uses Amazon Nova to Make Body Recomposition Accessible to Everyone

*Tag: Amazon-Nova*

---

When we started building Recomp for the Amazon Nova AI Hackathon, we had a clear goal: close the gap between people who can afford personalized fitness guidance and everyone else. Body recomposition is well understood scientifically, but most tools require manual data entry, cost hundreds per month, or deliver one-size-fits-all advice. We wanted to see what's possible when the full Amazon Nova portfolio is applied to wellness.

**Who Recomp Serves.** Our target community wants personalized guidance without hiring a coach, low-friction meal logging (not typing every ingredient), and integration with devices they already own (Oura, Fitbit, Apple Watch). Voice, photo, and receipt-based logging let you log a meal in seconds instead of minutes.

**Benefits.** Nova Sonic enables voice meal logging. Nova Lite vision handles plate photos and receipt scans. For users with mobility issues or dyslexia, multimodal input removes barriers. Recomp runs on AWS with no per-use AI surcharge. The AI coach (Reco) answers context-aware questions; a multi-agent weekly review synthesizes meals, wearables, and web research; Nova Canvas generates a goal-based "after" image from a body photo.

**Real-World Applications.** Individuals can speak meals during a commute, snap a receipt, or upload a plate photo. Employers can offer Recomp as a single wellness tool. Dietitians and telehealth can use AI-generated plans with voice/photo logging. Gyms get personalized plans and an AI coach between sessions.

**Why Multi-Agent.** The design emerged from: *What would make someone stick with this?* Answer: lower friction and actionable feedback. A coordinator delegates to specialist agents (meal analyst, wellness with web grounding) producing deeper output. We built fallbacks when Act or DynamoDB isn't available. Nova Act can search Amazon Fresh and add to cart.

**Adoption Plans.** We plan to open-source Recomp, offer Docker/Terraform for one-click deployment, pursue integrations (Cronometer, MyFitnessPal), and run enterprise pilots. We hope Recomp demonstrates that Nova is a full-stack AI platform — voice, vision, agents, and grounding combined — and that wellness doesn't require walled gardens.

## Evidence and Results

To validate real-world value, we track outcomes that map directly to friction reduction and adherence:

### Key Metrics

| Metric | Why it matters | Current value |
|---|---|---|
| Avg meal logging time (text) | Baseline speed for manual entry | `<fill>` sec |
| Avg meal logging time (voice) | Low-friction accessibility path | `<fill>` sec |
| Avg meal logging time (photo) | Multimodal logging convenience | `<fill>` sec |
| Avg meal logging time (receipt) | Grocery-to-log automation efficiency | `<fill>` sec |
| Onboarding completion rate | Product activation quality | `<fill>`% |
| Weekly review usage (>=1/week) | Agentic feature engagement | `<fill>`% |
| 7-day adherence proxy (active days/user) | Early behavior consistency | `<fill>` days |

### Baseline vs Recomp (Novelty Validation)

We compare Recomp against a text-only baseline flow (manual meal entry + no multi-agent weekly synthesis):

| Outcome | Baseline | Recomp | Delta |
|---|---:|---:|---:|
| Time to log 3 meals | `<fill>` min | `<fill>` min | `<fill>`% |
| Manual input fields per 3 meals | `<fill>` | `<fill>` | `<fill>`% |
| Recommendation usefulness (1-5) | `<fill>` | `<fill>` | `+<fill>` |

### Demo Reliability for Judges

- **Pre-seeded demo user:** one-click onboarding bypass with realistic 7-day data (meals, workouts, wearables, weekly review, activity log).
- **Golden path:** onboarding -> dashboard -> meal log -> weekly review -> Reco chat.
- **Fallback transparency:** demo mode banner clearly indicates local deterministic data when optional integrations are unavailable.

---

*Recomp was built for the [Amazon Nova AI Hackathon](https://amazon-nova.devpost.com). Repository: [github.com/JStoweYouKnow/recomp](https://github.com/JStoweYouKnow/recomp).*
