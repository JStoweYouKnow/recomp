# Amazon Nova AI Hackathon — Submission Checklist

Complete these before submitting on Devpost.

---

## 1. Demo Video (~3 min)

- [ ] Record ~3 min walkthrough following [DEMO_VIDEO_SCRIPT.md](./DEMO_VIDEO_SCRIPT.md) (if present)
- [ ] Include **#AmazonNova** in the video title or description
- [ ] Upload to YouTube (unlisted OK) or Vimeo/Youku
- [ ] Add video URL to your Devpost submission

---

## 2. Live Demo URL

- [ ] Deploy: `cd recomp && vercel --prod`
- [ ] Set env vars in Vercel dashboard: `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `NOVA_REEL_S3_BUCKET`, optionally `DYNAMODB_TABLE_NAME`
- [ ] Set `JUDGE_MODE=true` in demo deployment for deterministic fallback (optional)
- [ ] Add the live URL to your Devpost submission
- [ ] Update README "Judge Access" section with the live URL

---

## 3. Repo Access for Judges

**Repo URL:** https://github.com/JStoweYouKnow/recomp (public)

If you switch the repo to **private**:
- [ ] Add `testing@devpost.com` as collaborator (Settings → Collaborators)
- [ ] Add `Amazon-Nova-hackathon@amazon.com` as collaborator

If **public**: no action needed.

---

## 4. Devpost Submission

- [ ] Submit at [Amazon Nova AI Hackathon](https://amazon-nova.devpost.com)
- [ ] Fill in: title, tagline, description (paste from [DEVPOST_ABOUT.md](./DEVPOST_ABOUT.md)), demo video URL, live demo URL, repo URL
- [ ] Select category: **Freestyle** or **Agentic AI**
- [ ] Add #AmazonNova and #AmazonNovaHackathon to description

---

## 5. Testing Instructions (for judges)

Include this in your Devpost **Testing instructions** field:

### 2-minute golden path

1. Open the live URL.
2. Click **Try pre-seeded demo user (instant dashboard)** on the landing page.
3. Dashboard loads with Jordan's 7-day data. Click **Show metrics** in the "Evidence & Results" card.
4. Go to **Meals** → add one text meal.
5. Return to **Dashboard** → click **Generate** in the Weekly AI Review card (multi-agent demo).
6. Click the **🧩 Reco** button → send one text message, or switch to **Voice** and hold the mic to try Nova Sonic.

### Optional (5–10 min) — full Nova feature tour

- **Voice onboarding**: Reset demo, then choose "Voice" instead of "Form" and answer Reco's questions out loud.
- **Plan generation**: Reset demo, fill the form, submit — Nova Lite generates diet + workout plan.
- **Transformation preview**: Dashboard → upload a full-body photo → "Generate after image" (Nova Canvas).
- **Shopping list**: Dashboard → load from plan → send to Amazon (Nova Act; demo fallback if Act unavailable).
- **Nova Labs**: Meals → Snap plate (Nova Lite vision) or Receipt scan; Adjust → "Add latest guidelines" (Nova research).

### Verify health

- `GET /api/judge/health` — confirms plan, voice, Reel, Act, etc. status.

---

## 6. Screenshots & Verification

- [ ] Take 1–3 screenshots: Dashboard (with Evidence card), Meals (voice/photo flow), Reco chat
- [ ] Add screenshots to Devpost submission
- [ ] Verify demo mode: visit live URL in incognito → "Demo mode" banner and full app
- [ ] Verify golden path end-to-end

---

*Last updated: Feb 2026*
