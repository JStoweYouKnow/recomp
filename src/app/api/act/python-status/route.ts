import { NextResponse } from "next/server";
import { execSync } from "child_process";

/**
 * Diagnostic endpoint to debug Python availability for Nova Act.
 * GET /api/act/python-status
 */
export async function GET() {
  const path = process.env.PATH ?? "";
  const actPython = process.env.ACT_PYTHON ?? null;
  const pythonEnv = process.env.PYTHON ?? null;
  const pathParts = path.split(":").filter(Boolean);

  const checks: Record<string, { found: boolean; path?: string; version?: string; error?: string }> = {};

  if (actPython) {
    try {
      const v = execSync(`"${actPython}" --version 2>&1`, { encoding: "utf8", timeout: 2000 }).trim();
      checks["ACT_PYTHON"] = { found: true, path: actPython, version: v };
    } catch {
      checks["ACT_PYTHON"] = { found: false, path: actPython, error: "Not executable or not found" };
    }
  }

  for (const cmd of ["python3", "python"]) {
    try {
      const out = execSync(`which ${cmd} 2>/dev/null || echo ""`, { encoding: "utf8", timeout: 3000 }).trim();
      const found = !!out;
      checks[cmd] = { found };
      if (found) {
        checks[cmd].path = out;
        try {
          const v = execSync(`"${out}" --version 2>&1`, { encoding: "utf8" }).trim();
          checks[cmd].version = v;
        } catch (e) {
          checks[cmd].error = String(e);
        }
      }
    } catch (e) {
      checks[cmd] = { found: false, error: String(e) };
    }
  }

  // Try common absolute paths (macOS / Homebrew)
  const commonPaths = [
    "/opt/homebrew/bin/python3",
    "/usr/local/bin/python3",
    "/usr/bin/python3",
    "/Library/Frameworks/Python.framework/Versions/3.11/bin/python3",
  ];
  for (const p of commonPaths) {
    try {
      const v = execSync(`"${p}" --version 2>&1`, { encoding: "utf8", timeout: 2000 }).trim();
      checks[p] = { found: true, path: p, version: v };
    } catch {
      checks[p] = { found: false, path: p };
    }
  }

  const firstFound = Object.entries(checks).find(([, v]) => v.found && v.path);
  const recommended =
    actPython && checks[actPython]?.found
      ? `ACT_PYTHON=${actPython} is set and works`
      : actPython
        ? `ACT_PYTHON=${actPython} not found — try ACT_PYTHON=/opt/homebrew/bin/python3`
        : checks["python3"]?.path
          ? "python3 is available — no ACT_PYTHON needed"
          : firstFound
            ? `Set ACT_PYTHON=${firstFound[1].path}`
            : "Python not found. Install: brew install python3";

  return NextResponse.json({
    ACT_PYTHON: actPython,
    PYTHON: pythonEnv,
    PATH_preview: pathParts.slice(0, 5).join(":") + (pathParts.length > 5 ? "…" : ""),
    PATH_parts_count: pathParts.length,
    checks,
    recommended,
    cwd: process.cwd(),
  });
}
