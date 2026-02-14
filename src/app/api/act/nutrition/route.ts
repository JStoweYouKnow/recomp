import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import {
  fixedWindowRateLimit,
  getClientKey,
  getRateLimitHeaderValues,
  getRequestIp,
} from "@/lib/server-rate-limit";

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
    proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

    proc.on("close", (code) => {
      try {
        const data = JSON.parse(stdout || "{}");
        if (code !== 0 && data.error) {
          reject(new Error(data.error));
          return;
        }
        if (code !== 0) {
          reject(new Error(stderr || data.error || `Process exited with code ${code}`));
          return;
        }
        resolve(data);
      } catch {
        reject(new Error(stderr || (code !== 0 ? `Process exited with code ${code}` : "Invalid JSON from Python script")));
      }
    });

    proc.on("error", reject);

    proc.stdin.write(stdinData);
    proc.stdin.end();
  });
}
