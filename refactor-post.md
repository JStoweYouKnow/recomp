# I deleted MyFitnessPal, Strong, and MacroFactor — then built the app I actually wanted

*Four weeks of recomp data, pulled straight out of the app I now use every day.*

---

Six months ago I weighed 183 pounds at 12.6% body fat. I had MyFitnessPal, Strong, Hevy, MacroFactor, and Carbon installed on my phone. None of them were working.

This is the story of why I deleted them, what I built instead, and the first four weeks of actual data from **Refactor** — the app I use every day now.

## 1. The goal

I'm not trying to get shredded. I'm doing a slow body recomposition: lose fat, hold (or build) muscle, on a timeline that's compatible with a job and a normal life.

**Starting numbers (February 2026):**

- Weight: **183.2 lbs**
- Body fat: **12.6%**
- Lean mass (est.): **160.1 lbs**

**12-week targets:**

- Weight: **185.0 lbs** (+1.8 lbs)
- Body fat: **10.0%** (↓2.6%)
- Lean mass: **166.5 lbs** (hold or +)
- Protein floor: **195 g/day**
- Calories: ~**3,055/day**, cycled slightly with training
- 4 sessions per week, 30–45 minutes each

That last line matters. Most recomp content assumes you can lift 5–6x a week for an hour. I can't. The constraints are non-negotiable, so the app has to be built around them.

## 2. Why existing apps failed me

I'm not going to dunk on these apps — most of them are good at what they were built for. They just weren't built for what I was trying to do.

**MyFitnessPal.** Too much friction to log every meal. After two weeks I stopped opening it. The thing about nutrition logging is that the marginal hour of effort per week kills compliance long before it kills your weight.

**Strong / Hevy.** Excellent workout loggers. But they know nothing about my body comp. They'll happily let me crush a heavy session on a 500-calorie-deficit day, which is exactly the recipe for grinding away lean mass — the thing I'm trying not to do.

**MacroFactor.** Closest to what I wanted on the nutrition side. But it doesn't talk to my training, and its UI quietly assumes you're either bulking or cutting cleanly. Recomp is neither.

**Carbon.** Same problem. Worse UX.

**Fitbod / Hevy Coach.** Algorithmically programmed, but the algorithms are opinionated in ways I disagreed with — they push volume up faster than I want when I'm in a deficit.

The pattern underneath all of these: every app solved exactly one slice — workouts, *or* macros, *or* weigh-ins. None of them held the whole picture and adjusted when I went off-plan. And going off-plan is the default state of an adult trying to recomp.

I wanted one app that knew my weight this morning, my training load yesterday, what I'd eaten this week, and could give me a single coherent recommendation for what today should look like.

That app didn't exist.

## 3. What I built, and the decisions that shaped it

Refactor is a Next.js app on AWS serverless — DynamoDB, Bedrock, S3, Upstash. The interesting choices are the product ones, not the infrastructure.

**One model of the athlete, three inputs.** Body metrics, workouts, and macros all feed a single nightly recomputation of "state of the athlete." Every screen reads from the same model. The app can't show you inconsistent things because there's only one source of truth.

**Bedrock for coaching, not chat.** I didn't want to ship "AI fitness chat." I wanted the model to do exactly one thing: look at the last 14 days and answer *what should today look like?* You open the app, you see one recommendation — a training focus, a calorie target, a protein floor. No prompting, no conversation, no tokens wasted. Bedrock runs once per user per day.

**DynamoDB single-table.** Everything keyed on `USER#<id>` with sort keys like `METRIC#2026-04-12`, `WORKOUT#2026-04-12#evening`, `MEAL#2026-04-12#breakfast`. A user-day is a single query. That's the only access pattern that matters for an app like this.

**Upstash for the hot path.** Streaks, today's checklist, "have you weighed in yet?" — all the read-heavy ephemeral stuff lives in Upstash Redis. DynamoDB stays clean for the durable record.

**Encrypted progress photos in S3.** Client-side encryption before upload. I don't see them. Nobody else does either. Not because I don't trust myself — because I shouldn't have to.

**No social features. None.** No friends, no feed, no leaderboards. Recomp is a long, individual, kind of boring process. Adding social pressure pushes you to optimize for *looking* like you're making progress, which is the opposite of the thing you actually want.

**One-tap logging for the 80% case.** Weighed in? One tap, scroll wheel, done. Same breakfast as yesterday? One tap. The default action on every screen is the action you're most likely to take.

The honest part: I rebuilt the nutrition logger three times. V1 was a USDA food database with search — miserable. V2 was a barcode scanner — fine but slow. V3, shipped: you type "two eggs, oatmeal with peanut butter, coffee with cream" and Bedrock parses it into macros. That's the version that finally stuck.

## 4. Four weeks of my own data

This is the part I was most curious about. I pulled the last 28 days out of Refactor's tables and let the numbers tell the story.

**28-day window: April 16 – May 13, 2026**

### Week 1 (Apr 16 – Apr 22)
- Avg weight: **183.2 lbs** (scale sparse this week)
- Avg body fat: **12.4%** (Apr 17 reading)
- Workouts completed: **4 / 4**
- Avg daily protein: **208 g** (target 195 g) ✓
- Avg daily calories: **2,638** (target 3,055)
- Days logged: **7 / 7**

### Week 2 (Apr 23 – Apr 29)
- Avg weight: **183.2 lbs** (estimated — no scale reading this week)
- Avg body fat: **12.9%** (Apr 29 reading)
- Workouts: **4 / 4**
- Avg daily protein: **193 g** (target 195 g)
- Avg daily calories: **2,453** (target 3,055)
- Days logged: **6 / 7**

### Week 3 (Apr 30 – May 6)
- Avg weight: **183.2 lbs** (May 6 reading: 183.2)
- Avg body fat: **12.6%** (May 6 reading)
- Workouts: **4 / 4**
- Avg daily protein: **173 g** (target 195 g)
- Avg daily calories: **2,507** (target 3,055)
- Days logged: **7 / 7**

### Week 4 (May 7 – May 13)
- Avg weight: **183.8 lbs** (May 11 reading)
- Avg body fat: **12.7%** (May 11 reading)
- Workouts: **4 / 4**
- Avg daily protein: **179 g** (target 195 g)
- Avg daily calories: **2,669** (target 3,055)
- Days logged: **7 / 7**

### The 28-day summary

- **Body weight:** **+0.6 lbs** (183.2 → 183.8)
- **Estimated body fat:** **+0.1%** (12.6% → 12.7%) — essentially flat
- **Estimated lean mass:** **+0.4 lbs** (160.1 → 160.5) — the recomp number, the thing no other app on my phone was tracking honestly
- **Training adherence:** **16 / 16** sessions (100%)
- **Protein floor hit:** **12 / 27** days (44%)
- **Calorie adherence (±150):** **3 / 27** days (11%)
- **Engagement:** **27 / 28** days logged at least one meal

What jumps out: I averaged **2,571 calories against a 3,055 target** — consistently ~480 under. This isn't a logging compliance problem (27/28 days logged), it's an eating problem. I'm not hitting my surplus on training days, which is exactly the thing that caps muscle growth on a recomp. Weeks 1–2 were fine on protein; weeks 3–4 I fell off. The two signals are correlated — the weeks I ate less also had lower protein.

What didn't go well: **Calorie targets. I'm chronically under on calories despite a muscle-building goal. The food volume required to hit 3,055 on training days is more than I'm naturally eating, and I'm not compensating. This is the variable that most needs fixing in month 2.**

## What's next

Refactor is on TestFlight — **[join the beta here](https://testflight.apple.com/join/tXrkQEUy)**. If you've been trying to recomp and bouncing between four apps to do it, this is the niche it's built for.

I'll publish one of these every four weeks. Same format, same data pulls, same level of honesty. If the curves stop going the right direction, you'll see it here first.

---

*Refactor is built by James. [Twitter/site/email].*
