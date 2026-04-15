import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";

async function fetchOura(token: string, path: string, params?: Record<string, string>) {
  const url = new URL(`https://api.ouraring.com/v2/usercollection/${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Oura API ${res.status}`);
  return res.json();
}

export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const token = req.cookies.get("oura_token")?.value;
  const tokenUserId = req.cookies.get("oura_token_uid")?.value;
  if (tokenUserId !== userId) {
    return NextResponse.json({ error: "Oura token mismatch" }, { status: 401 });
  }
  if (!token) return NextResponse.json({ error: "Not connected" }, { status: 401 });

  try {
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const start = weekAgo.toISOString().slice(0, 10);

    const [daily, sleep, sessions] = await Promise.all([
      fetchOura(token, "daily_activity", { start_date: start, end_date: today }),
      fetchOura(token, "daily_sleep", { start_date: start, end_date: today }),
      fetchOura(token, "daily_readiness", { start_date: start, end_date: today }),
    ]);

    const days = new Map<string, Record<string, unknown>>();
    (daily.data ?? []).forEach((d: { day?: string }) => { const day = d.day ?? (d as { date?: string }).date; if (day) days.set(day, { ...days.get(day), ...d, _source: "activity" }); });
    (sleep.data ?? []).forEach((d: { day?: string }) => { const day = d.day ?? (d as { date?: string }).date; if (day) days.set(day, { ...days.get(day), sleepScore: (d as { score?: number }).score, total_sleep_duration: (d as { total_sleep_duration?: number }).total_sleep_duration }); });
    (sessions.data ?? []).forEach((d: { day?: string }) => { const day = d.day ?? (d as { date?: string }).date; if (day) days.set(day, { ...days.get(day), readinessScore: (d as { score?: number }).score }); });

    const summaries = Array.from(days.entries()).map(([date, d]) => ({
      date,
      provider: "oura",
      steps: (d as { steps?: number }).steps ?? (d as { step_count?: number }).step_count,
      caloriesBurned: (d as { total_calories?: number }).total_calories ?? (d as { active_calories?: number }).active_calories,
      activeMinutes: (d as { active_duration?: number }).active_duration ? Math.round((d as { active_duration: number }).active_duration / 60) : undefined,
      sleepScore: (d as { sleepScore?: number }).sleepScore ?? (d as { score?: number }).score,
      sleepDuration: (d as { total_sleep_duration?: number }).total_sleep_duration ? Math.round((d as { total_sleep_duration: number }).total_sleep_duration / 60) : undefined,
      readinessScore: (d as { readinessScore?: number }).readinessScore,
    }));

    return NextResponse.json({ data: summaries });
  } catch (err) {
    console.error("Oura fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch Oura data" }, { status: 500 });
  }
}
