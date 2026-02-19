import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import {
  fixedWindowRateLimit,
  getClientKey,
  getRateLimitHeaderValues,
  getRequestIp,
} from "@/lib/server-rate-limit";
import { isJudgeMode } from "@/lib/judgeMode";

const TIMEOUT_MS = 60_000; // 60 seconds

export async function POST(req: NextRequest) {
  try {
    const rl = fixedWindowRateLimit(getClientKey(getRequestIp(req), "act-nutrition"), 12, 60_000);
    if (!rl.ok) {
      const headers = getRateLimitHeaderValues(rl);
      const res = NextResponse.json({ error: "Rate limit exceeded. Try again shortly." }, { status: 429 });
      res.headers.set("X-RateLimit-Limit", headers.limit);
      res.headers.set("X-RateLimit-Remaining", headers.remaining);
      res.headers.set("X-RateLimit-Reset", headers.reset);
      res.headers.set("Retry-After", headers.retryAfter);
      return res;
    }

    const { food } = await req.json();
    if (!food || typeof food !== "string") {
      return NextResponse.json({ error: "Food name required" }, { status: 400 });
    }

    if (isJudgeMode()) {
      const normalized = food.toLowerCase().trim();
      const calories = 160 + (normalized.length % 6) * 35;
      const protein = 10 + (normalized.length % 5) * 4;
      const carbs = 12 + (normalized.length % 7) * 3;
      const fat = 4 + (normalized.length % 4) * 2;
      const res = NextResponse.json({
        food,
        nutrition: { calories, protein, carbs, fat },
        source: "judge-fallback",
        demoMode: true,
        note: "JUDGE_MODE deterministic fallback response",
      });
      const headers = getRateLimitHeaderValues(rl);
      res.headers.set("X-RateLimit-Limit", headers.limit);
      res.headers.set("X-RateLimit-Remaining", headers.remaining);
      res.headers.set("X-RateLimit-Reset", headers.reset);
      return res;
    }

    const scriptPath = path.join(process.cwd(), "scripts", "nova_act_nutrition.py");
    const input = JSON.stringify({ food });

    const result = await runPython(scriptPath, input);
    const res = NextResponse.json(result);
    const headers = getRateLimitHeaderValues(rl);
    res.headers.set("X-RateLimit-Limit", headers.limit);
    res.headers.set("X-RateLimit-Remaining", headers.remaining);
    res.headers.set("X-RateLimit-Reset", headers.reset);
    return res;
  } catch (err) {
    console.error("Act nutrition error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Nutrition lookup failed" },
      { status: 500 }
    );
  }
}

function runPython(scriptPath: string, stdinData: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const proc = spawn("python3", [scriptPath], {
      env: { ...process.env },
      timeout: TIMEOUT_MS,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk) => {
      // Nova Act logs to stderr — expected, not an error
      stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      const trimmed = stdout.trim();
      // Extract last JSON object from stdout (in case Nova Act leaked output before our json.dumps)
      let jsonStr = trimmed;
      const lastBrace = trimmed.lastIndexOf("}");
      if (lastBrace >= 0) {
        let depth = 0;
        let start = -1;
        for (let i = lastBrace; i >= 0; i--) {
          if (trimmed[i] === "}") depth++;
          else if (trimmed[i] === "{") depth--;
          if (depth === 0) { start = i; break; }
        }
        if (start >= 0) jsonStr = trimmed.slice(start, lastBrace + 1);
      }

      try {
        const data = JSON.parse(jsonStr || "{}");
        if (data.error && code !== 0) {
          reject(new Error(data.error));
          return;
        }
        // Valid JSON with result — resolve even if process exited non-zero (e.g. timeout after writing)
        resolve(data);
      } catch {
        const isNovaLog = /agentType|think\s*\(/.test(stderr);
        const timedOut = code === null || code === 143; // 143 = SIGTERM from spawn timeout
        const hint = timedOut
          ? "Nutrition lookup timed out (60s). Try again or use a shorter food name."
          : `Process exited with code ${code}.`;
        reject(new Error(isNovaLog || timedOut ? `${hint} Nova Act may need more time.` : (stderr || hint)));
      }
    });

    proc.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ETIMEDOUT") {
        reject(new Error("Nutrition lookup timed out. Try again."));
      } else {
        reject(err);
      }
    });

    proc.stdin.write(stdinData);
    proc.stdin.end();
  });
}
