"""
Nova Act HTTP service — runs nutrition lookup and grocery search.
Deploy to Railway, Render, or any Python-friendly host. Set ACT_SERVICE_URL
in your Next.js app to use this instead of local Python spawn.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

from flask import Flask, jsonify, request

app = Flask(__name__)

SCRIPT_DIR = Path(__file__).resolve().parent.parent / "scripts"
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
        out = proc.stdout.decode().strip() or "{}"
        # Extract last JSON object (script may log to stdout)
        last_brace = out.rfind("}")
        if last_brace >= 0:
            start = out.rfind("{", 0, last_brace + 1)
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


@app.route("/nutrition", methods=["POST"])
def nutrition():
    data = request.get_json() or {}
    food = data.get("food", "").strip()
    if not food:
        return jsonify({"error": "Food name required"}), 400
    result = run_script(NUTRITION_SCRIPT, {"food": food}, timeout=90)
    if "error" in result and result.get("error") and "nutrition" not in result:
        return jsonify(result), 500
    return jsonify(result)


@app.route("/grocery", methods=["POST"])
def grocery():
    data = request.get_json() or {}
    items = data.get("items", [])
    store = data.get("store", "fresh")
    add_to_cart = data.get("addToCart", False)
    if not items or not isinstance(items, list):
        return jsonify({"error": "Items array required", "results": []}), 400
    if store not in ("fresh", "wholefoods", "amazon"):
        store = "fresh"
    result = run_script(
        GROCERY_SCRIPT,
        {"items": items[: 2 if add_to_cart else 3], "store": store, "addToCart": add_to_cart},
        timeout=420 if add_to_cart else 360,
    )
    return jsonify(result)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
