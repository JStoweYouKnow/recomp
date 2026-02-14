# Amazon Nova AI Hackathon — Submission Checklist

Complete these before submitting on Devpost.

---

## 4. Demo Video (~3 min)

- [ ] Record ~3 min walkthrough following [DEMO_VIDEO_SCRIPT.md](./DEMO_VIDEO_SCRIPT.md)
- [ ] Include **#AmazonNova** in the video title or description
- [ ] Upload to YouTube (unlisted OK) or preferred hosting
- [ ] Add video URL to your Devpost submission

---

## 5. Live Demo URL

- [ ] Log in: `vercel login` (if not already)
- [ ] Deploy: `cd recomp && vercel --prod`
- [ ] Set env vars in Vercel dashboard: `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, optionally `DYNAMODB_TABLE_NAME`
- [ ] Add the live URL to your Devpost submission
- [ ] Update README "Judge Access" section with the live URL

---

## 6. Repo Access for Judges

If the repo is **private**:

- [ ] Add `testing@devpost.com` as collaborator (Settings → Collaborators)
- [ ] Add `Amazon-Nova-hackathon@amazon.com` as collaborator
- [ ] Or make the repo **public** before submission

If the repo is **public**: no action needed.

---

## 7. Devpost Submission

- [ ] Submit at [Amazon Nova AI Hackathon](https://amazon-nova.devpost.com) with your project
- [ ] Fill in: title, tagline, description, demo video URL, live demo URL, repo URL
- [ ] Select hackathon category (Freestyle or Agentic AI)
- [ ] Add #AmazonNova and #AmazonNovaHackathon to description
- [ ] Submit before the deadline

---

## 8. Screenshots & Demo Verification

- [ ] Take 1–3 screenshots: Dashboard, Meals (voice/photo flow), Reco chat
- [ ] Add screenshots to Devpost submission (optional but recommended)
- [ ] Verify demo mode works: visit live URL in incognito → should see "Demo mode" banner and full app
- [ ] Verify "How to Evaluate" flow (README): onboarding → dashboard → meals → Reco → weekly review → Adjust

---

*Last updated: Feb 2025*
