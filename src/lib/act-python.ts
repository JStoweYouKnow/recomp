import { spawn } from "child_process";

/** Resolve Python executable: ACT_PYTHON or PYTHON env, else python3, with python as fallback on ENOENT. */
export function getPythonCommand(): string {
  return process.env.ACT_PYTHON || process.env.PYTHON || "python3";
}

export function runPython(
  scriptPath: string,
  stdinData: string,
  options?: { timeoutMs?: number }
): Promise<unknown> {
  const timeoutMs = options?.timeoutMs ?? 60_000;
  const cmd = getPythonCommand();
  return runPythonWithCommand(cmd, scriptPath, stdinData, timeoutMs).catch((err) => {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" && cmd === "python3" && !process.env.ACT_PYTHON && !process.env.PYTHON) {
      return runPythonWithCommand("python", scriptPath, stdinData, timeoutMs).catch((retryErr) => {
        if ((retryErr as NodeJS.ErrnoException).code === "ENOENT") {
          throw new Error("Python not found. Install Python 3 (e.g. brew install python3) or set ACT_PYTHON=/path/to/python");
        }
        throw retryErr;
      });
    }
    throw err;
  });
}

function runPythonWithCommand(
  pythonCommand: string,
  scriptPath: string,
  stdinData: string,
  timeoutMs: number
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const proc = spawn(pythonCommand, [scriptPath], {
      env: { ...process.env },
      timeout: timeoutMs,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

    proc.on("close", (code) => {
      const trimmed = stdout.trim();
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
        resolve(data);
      } catch {
        const timedOut = code === null || code === 143;
        const hint = timedOut
          ? "Process timed out. Nova Act may need more time."
          : `Process exited with code ${code}.`;
        reject(new Error(`${hint} ${stderr ? stderr.slice(-200) : ""}`));
      }
    });

    proc.on("error", (err) => {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ETIMEDOUT") {
        reject(new Error("Operation timed out. Try again."));
      } else {
        reject(err);
      }
    });

    proc.stdin.write(stdinData);
    proc.stdin.end();
  });
}
