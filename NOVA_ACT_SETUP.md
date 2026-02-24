# Nova Act Setup & Troubleshooting

Nova Act powers **Auto-fill nutrition** (USDA lookup) and **Send to Whole Foods/Fresh** (grocery search). This guide covers setup and common issues.

## Quick checklist

| Requirement | How to verify |
|-------------|---------------|
| **NOVA_ACT_API_KEY** | Get from [nova.amazon.com/act → Dev Tools](https://nova.amazon.com/act?tab=dev_tools). Required. |
| Python 3 | `python3 --version` or `which python3` |
| `nova-act` package | `pip3 show nova-act` or `python3 -c "import nova_act"` |
| ACT_PYTHON (optional) | Set in `.env.local` if `python3` isn't in PATH |
| Amazon login (add-to-cart) | Run `setup_amazon_login.py` once, set `NOVA_ACT_USER_DATA_DIR` |

---

## 0. Nova Act API key (required)

Nova Act needs an API key. Without it you’ll see: *"Authentication Failed With Invalid Credentials Configuration"*.

1. Go to [https://nova.amazon.com/act?tab=dev_tools](https://nova.amazon.com/act?tab=dev_tools)
2. Sign in and create or copy your API key
3. Add to `.env.local`:
   ```
   NOVA_ACT_API_KEY=your-key-here
   ```
4. For running scripts directly (e.g. setup_amazon_login.py):
   ```bash
   export NOVA_ACT_API_KEY=your-key-here
   ```

---

## 1. Python

Nova Act scripts run via Python. The app spawns `python3` (or `ACT_PYTHON` if set).

**Check:** `which python3`  
**Install:** `brew install python3` (macOS)

If Python exists but the app can't find it (e.g. when run from an IDE), set the full path in `.env.local`:

```
ACT_PYTHON=/Library/Frameworks/Python.framework/Versions/3.11/bin/python3
```

Or: `ACT_PYTHON=/opt/homebrew/bin/python3`

**Diagnostic:** `GET /api/act/python-status` — shows what the server sees.

---

## 2. Nova Act SDK

Install the package:

```bash
pip3 install nova-act
# or
pip3 install -r scripts/requirements.txt
```

**Check:** `python3 -c "import nova_act; print('OK')"`

Without `nova-act`:
- **Nutrition:** App returns estimated values and suggests `pip install nova-act`
- **Grocery:** Returns "Not found" for items and suggests `pip install nova-act`

---

## 3. Test the scripts manually

### Nutrition

```bash
echo '{"food": "chicken breast"}' | python3 scripts/nova_act_nutrition.py
```

If `nova-act` is installed, this opens a browser and searches USDA. If not, it uses built-in demo data.

### Grocery (search only)

```bash
echo '{"items": ["greek yogurt"], "store": "wholefoods", "addToCart": false}' | python3 scripts/nova_act_grocery.py
```

If this errors with "nova-act package not installed", run `pip3 install nova-act`.

---

## 4. Add-to-cart (grocery only)

Adding items to your Amazon cart requires a saved login. One-time setup:

```bash
export NOVA_ACT_USER_DATA_DIR=~/nova-act-amazon-profile
python3 scripts/setup_amazon_login.py
```

Log into Amazon in the browser that opens, then press Enter.

Add to `.env.local` so the app reuses the profile:

```
NOVA_ACT_USER_DATA_DIR=/Users/you/nova-act-amazon-profile
```

---

## 5. Common issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Authentication Failed With Invalid Credentials" | NOVA_ACT_API_KEY not set | Get key from nova.amazon.com/act → Dev Tools; add to .env.local |
| "Python not found" | Python not in PATH or ACT_PYTHON wrong | Set `ACT_PYTHON` to full path; run `/api/act/python-status` |
| "Nova Act SDK not installed" | `nova-act` not installed | `pip3 install nova-act` |
| Nutrition returns estimated values | nova-act missing OR Python missing | Install both; restart dev server |
| Grocery shows "Not found" for all items | nova-act missing | `pip3 install nova-act` |
| Add-to-cart fails | Amazon not logged in | Run `setup_amazon_login.py`, set `NOVA_ACT_USER_DATA_DIR` |
| Script times out | USDA/Amazon slow, or browser stuck | Retry; use fewer items for grocery |

---

## 6. Production (Vercel + Act service)

Nova Act **does not run on Vercel** — serverless functions have no Python or browser.

**Option A – Act service (recommended):** Deploy the `act-service/` to Railway, Render, or any host that supports Python + Chromium. Set `ACT_SERVICE_URL` in Vercel env (e.g. `https://your-act-service.up.railway.app`). The Next.js app will call the service first and fall back to local Python or estimated values if the service fails.

**Option B – No service:** The app returns graceful fallbacks (estimated nutrition, empty-style grocery results with a note). Real Act automation works only when running locally with the setup above.

### Deploying the Act service (Railway / Render)

1. Build from project root: `docker build -f act-service/Dockerfile -t act-service .`
2. Or deploy `act-service/` as a Python app; ensure Chromium is available (see `act-service/Dockerfile`).
3. Set `NOVA_ACT_API_KEY` in the service’s environment.
4. Set `ACT_SERVICE_URL` in Vercel to your deployed service URL.

**Add-to-cart in production:** The app returns "Add to cart" links when you check that option. Click the link in your browser (while logged into Amazon)—the item is added to *your* cart. No local setup needed. Optional: set `AMAZON_ASSOCIATE_TAG` (from Amazon Associates) for proper attribution. For automated click-to-add (local only), run `setup_amazon_login.py` and set `NOVA_ACT_USER_DATA_DIR`.
