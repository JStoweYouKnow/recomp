"""
Nova Act HTTP service — runs nutrition lookup and grocery search.
Deploy to Railway, Render, or any Python-friendly host. Set ACT_SERVICE_URL
in your Next.js app to use this instead of local Python spawn.
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

from flask import Flask, jsonify, request, make_response

app = Flask(__name__)

def _allowed_origins():
    extra = os.environ.get("CORS_ORIGINS", "")
    base = {
        "https://recomp-one.vercel.app",
        "https://recomp-james-stowes-projects.vercel.app",
        "https://recomp-git-main-james-stowes-projects.vercel.app",
        "http://localhost:3000",
    }
    for o in extra.split(","):
        o = o.strip()
        if o:
            base.add(o)
    return base


ALLOWED_ORIGINS = _allowed_origins()

@app.after_request
def add_cors_headers(response):
    origin = request.headers.get("Origin", "")
    if origin in ALLOWED_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response

@app.before_request
def handle_preflight():
    if request.method == "OPTIONS":
        resp = make_response()
        origin = request.headers.get("Origin", "")
        if origin in ALLOWED_ORIGINS:
            resp.headers["Access-Control-Allow-Origin"] = origin
            resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
            resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        return resp

# In Docker: app.py at /app/app.py, scripts at /app/scripts. Locally: act-service/app.py, scripts at recomp/scripts.
_basedir = Path(__file__).resolve().parent
SCRIPT_DIR = _basedir / "scripts" if (_basedir / "scripts").exists() else _basedir.parent / "scripts"
NUTRITION_SCRIPT = SCRIPT_DIR / "nova_act_nutrition.py"
GROCERY_SCRIPT = SCRIPT_DIR / "nova_act_grocery.py"


def run_script(script_path: Path, input_json: dict, timeout: int = 120) -> dict:
    """Run a Python script with JSON stdin, return parsed JSON stdout."""
    if not script_path.exists():
        return {"error": f"Script not found: {script_path}"}
    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    try:
        proc = subprocess.run(
            [sys.executable, str(script_path)],
            input=json.dumps(input_json).encode(),
            capture_output=True,
            timeout=timeout,
            cwd=str(SCRIPT_DIR.parent),
            env=env,
        )
        stderr_text = proc.stderr.decode()[:500]
        if stderr_text:
            print(f"[run_script] stderr: {stderr_text}", file=sys.stderr, flush=True)
        if proc.returncode != 0:
            print(f"[run_script] exit code: {proc.returncode}", file=sys.stderr, flush=True)
        raw = proc.stdout.decode()
        # Strip ANSI escape codes, carriage returns, and Nova Act spinner output
        raw = re.sub(r"\x1b\[[0-9;]*[a-zA-Z]", "", raw)
        raw = re.sub(r"\r[^\n]*", "", raw)
        raw = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", raw)
        out = raw.strip() or "{}"
        # Extract the last complete JSON object from output
        last_brace = out.rfind("}")
        if last_brace >= 0:
            # Find matching opening brace by scanning backwards
            depth = 0
            start = -1
            for idx in range(last_brace, -1, -1):
                if out[idx] == "}":
                    depth += 1
                elif out[idx] == "{":
                    depth -= 1
                    if depth == 0:
                        start = idx
                        break
            if start >= 0:
                out = out[start : last_brace + 1]
        return json.loads(out)
    except subprocess.TimeoutExpired:
        return {"error": "Request timed out. Try again."}
    except json.JSONDecodeError as e:
        return {"error": f"Invalid response: {e}", "raw": proc.stdout.decode()[:200] if proc else ""}


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"ok": True, "service": "recomp-act"})


# Fallback nutrition when script fails (timeout, crash, missing deps) — avoid 500 so UI can still show something
_DEMO_NUTRITION = {"calories": 150, "protein": 10, "carbs": 15, "fat": 5}


@app.route("/nutrition", methods=["POST"])
def nutrition():
    data = request.get_json() or {}
    food = data.get("food", "").strip()
    if not food:
        return jsonify({"error": "Food name required"}), 400
    result = run_script(NUTRITION_SCRIPT, {"food": food}, timeout=240)
    if "error" in result and result.get("error") and "nutrition" not in result:
        # Script failed — return 200 with estimated values so UI doesn't break; client can fall back to web lookup
        err_msg = result.get("error", "Lookup failed")
        print(f"[nutrition] Script failed for '{food}': {err_msg}", file=sys.stderr, flush=True)
        return jsonify({
            "food": food,
            "nutrition": _DEMO_NUTRITION,
            "found": True,
            "demoMode": True,
            "note": f"USDA lookup unavailable ({err_msg}). Using estimated values.",
        }), 200
    return jsonify(result)


@app.route("/grocery", methods=["POST"])
def grocery():
    data = request.get_json() or {}
    items = data.get("items", [])
    store = data.get("store", "fresh")

    if not items or not isinstance(items, list):
        return jsonify({"error": "Items array required", "results": []}), 400
    if store not in ("fresh", "wholefoods", "amazon"):
        store = "fresh"

    # Nova Act searches for each item and clicks Add to Cart on each product page.
    # Returns results with addedToCart and productUrl per item.
    result = run_script(
        GROCERY_SCRIPT,
        {"items": items[:5], "store": store},
        timeout=480,
    )

    return jsonify(result)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
