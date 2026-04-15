import { NextRequest, NextResponse } from "next/server";

async function fetchFitbit(
  token: string,
  path: string,
  params?: Record<string, string>
): Promise<{ access_token?: string; refresh_token?: string } | Record<string, unknown>> {
  const url = new URL(`https://api.fitbit.com/1/user/-/${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) throw new Error("TOKEN_EXPIRED");
  if (!res.ok) throw new Error(`Fitbit API ${res.status}`);
  return res.json();
}

export async function GET(req: NextRequest) {
  let token = req.cookies.get("fitbit_access_token")?.value;
  if (!token) return NextResponse.json({ error: "Not connected" }, { status: 401 });

  try {
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const start = weekAgo.toISOString().slice(0, 10);

    const [activities, sleep, bodyWeight] = await Promise.all([
      fetchFitbit(token, `activities/date/${today}.json`) as Promise<{ activities: unknown[]; summary: { steps?: number; caloriesOut?: number; activeMinutes?: number } }>,
      fetchFitbit(token, `sleep/date/${start}/${today}.json`) as Promise<{ sleep: { dateOfSleep: string; efficiency?: number; duration?: number }[] }>,
      fetchFitbit(token, `body/log/weight/date/${start}/30d.json`) as Promise<{ weight: { date: string; weight?: number; fat?: number; time?: string }[] }>,
    ]).catch(async (e) => {
      if (e.message === "TOKEN_EXPIRED" && req.cookies.get("fitbit_refresh_token")?.value) {
        const refreshRes = await fetch("https://api.fitbit.com/oauth2/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${Buffer.from(`${process.env.FITBIT_CLIENT_ID}:${process.env.FITBIT_CLIENT_SECRET}`).toString("base64")}`,
          },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: req.cookies.get("fitbit_refresh_token")!.value,
          }),
        });
        const refreshed = await refreshRes.json();
        if (refreshed.access_token) {
          token = refreshed.access_token;
          return Promise.all([
            fetchFitbit(token!, `activities/date/${today}.json`),
            fetchFitbit(token!, `sleep/date/${start}/${today}.json`),
            fetchFitbit(token!, `body/log/weight/date/${start}/30d.json`),
          ]);
        }
      }
      throw e;
    });

    const summaries: Array<{ date: string; provider: string; steps?: number; caloriesBurned?: number; activeMinutes?: number; sleepScore?: number; sleepDuration?: number; weight?: number; bodyFatPercent?: number }> = [];
    const act = activities as { summary?: { steps?: number; caloriesOut?: number; activeMinutes?: number } };
    if (act?.summary) {
      summaries.push({
        date: today,
        provider: "fitbit",
        steps: act.summary.steps,
        caloriesBurned: act.summary.caloriesOut,
        activeMinutes: act.summary.activeMinutes,
      });
    }
    const slp = sleep as { sleep?: { dateOfSleep: string; efficiency?: number; duration?: number }[] };
    if (slp?.sleep?.length) {
      slp.sleep.forEach((s) => {
        const existing = summaries.find((x) => x.date === s.dateOfSleep);
        if (existing) {
          Object.assign(existing, {
            sleepScore: s.efficiency,
            sleepDuration: s.duration ? Math.round(s.duration / 60000) : undefined,
          });
        } else {
          summaries.push({
            date: s.dateOfSleep,
            provider: "fitbit",
            sleepScore: s.efficiency,
            sleepDuration: s.duration ? Math.round(s.duration / 60000) : undefined,
          });
        }
      });
    }

    // Body weight from Fitbit Aria / compatible scales (syncs via Fitbit app)
    const bw = bodyWeight as { weight?: { date: string; weight?: number; fat?: number }[] };
    if (bw?.weight?.length) {
      bw.weight.forEach((w) => {
        const existing = summaries.find((x) => x.date === w.date);
        if (existing) {
          existing.weight = w.weight;
          if (w.fat != null) existing.bodyFatPercent = w.fat;
        } else {
          summaries.push({
            date: w.date,
            provider: "fitbit",
            weight: w.weight,
            bodyFatPercent: w.fat,
          });
        }
      });
    }

    return NextResponse.json({ data: summaries });
  } catch (err) {
    console.error("Fitbit fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch Fitbit data" }, { status: 500 });
  }
}
