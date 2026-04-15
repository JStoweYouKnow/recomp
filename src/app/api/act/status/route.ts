/**
 * Diagnostic: check if Act service (ACT_SERVICE_URL) is configured and reachable.
 * GET /api/act/status
 */
import { NextResponse } from "next/server";

export async function GET() {
  let base = (process.env.ACT_SERVICE_URL ?? "").trim().replace(/\/$/, "");
  const configured = !!base;
  if (base && !/^https?:\/\//i.test(base)) base = `https://${base}`;

  if (!configured) {
    return NextResponse.json({
      actServiceConfigured: false,
      message: "ACT_SERVICE_URL not set. Set it in Vercel env to use the remote Act service.",
      hint: "Add ACT_SERVICE_URL=https://your-railway-domain.up.railway.app in Vercel → Settings → Environment Variables",
    });
  }

  try {
    const res = await fetch(`${base}/health`, { method: "GET", signal: AbortSignal.timeout(5000) });
    const ok = res.ok;
    const data = ok ? await res.json() : null;
    return NextResponse.json({
      actServiceConfigured: true,
      actServiceUrl: base,
      reachable: ok,
      response: data,
      status: res.status,
    });
  } catch (err) {
    return NextResponse.json({
      actServiceConfigured: true,
      actServiceUrl: base,
      reachable: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
