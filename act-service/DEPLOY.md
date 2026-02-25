# Deploy Act Service (Railway)

## Bypass Vercel timeout (optional)

To avoid Vercel’s 60s/300s serverless limit, the browser can call the Act service on Railway directly. Railway has no practical request timeout.

1. Set **NEXT_PUBLIC_ACT_SERVICE_URL** in Vercel to your Railway URL (e.g. `https://recomp-production.up.railway.app`).
2. Ensure your Vercel domain is in the Act service CORS list (defaults include recomp-one.vercel.app). For custom domains, add `CORS_ORIGINS=https://your-domain.com` to Railway.
3. Redeploy. Grocery and nutrition will call Railway directly from the browser.

---

# Deploy Act Service (Railway)

## Quick deploy with Railway CLI

1. **Install Railway CLI** (if needed):
   ```bash
   npm install -g @railway/cli
   # or: brew install railway
   ```

2. **Important:** Run all Railway commands from the **recomp** folder (where `railway.toml` and `act-service/` live):
   ```bash
   cd /Users/v/Downloads/Richard\ Rider/recomp
   # or: cd path/to/your/recomp
   railway login
   railway init   # Create new project or link to existing
   ```

3. **Add env var** in Railway dashboard (or CLI):
   ```bash
   railway variable set NOVA_ACT_API_KEY=your-key-from-nova-amazon-com-act
   ```

4. **Deploy**:
   ```bash
   railway up
   ```

5. **Generate domain** – in Railway dashboard: your service → Settings → Networking → Generate Domain. Copy the URL (e.g. `https://recomp-act-production-xxxx.up.railway.app`).

6. **Set in Vercel** – add env var:
   ```
   ACT_SERVICE_URL=https://your-railway-domain.up.railway.app
   ```

---

## Deploy via Railway dashboard (no CLI)

1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
2. Connect your repo, select the `recomp` project (or the folder that contains `act-service/` and `scripts/`)
3. Railway should detect the Dockerfile. If not: Settings → Build → set **Dockerfile path** to `act-service/Dockerfile`
4. Settings → Variables → add `NOVA_ACT_API_KEY` (or run `railway variable set NOVA_ACT_API_KEY=your-key`)
5. Settings → Networking → Generate Domain
6. Copy the URL → add `ACT_SERVICE_URL` in Vercel

---

## If deploy fails

1. **Open build logs** (link in `railway up` output) in the Railway dashboard.
2. **If "could not determine how to build"** – add env var: `RAILWAY_DOCKERFILE_PATH=act-service/Dockerfile`
3. **If Playwright/Chromium fails** – the Dockerfile now uses the official Playwright image; redeploy.

---

## Verify

- `GET https://your-act-url/health` → `{"ok": true, "service": "recomp-act"}`
- `POST https://your-act-url/nutrition` with `{"food": "chicken breast"}` → nutrition data or error
