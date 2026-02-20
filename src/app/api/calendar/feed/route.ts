import { NextRequest, NextResponse } from "next/server";
import { dbGetUserIdByCalendarToken, dbGetPlan } from "@/lib/db";
import type { FitnessPlan, WorkoutDay } from "@/lib/types";

const WEEKDAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const SHORT = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** Map plan day string (e.g. "Monday", "Mon", "Day 1") to JS weekday 0=Sun..6=Sat */
function dayNameToWeekday(dayStr: string): number | null {
  const lower = dayStr.toLowerCase().trim();
  for (let i = 0; i < 7; i++) {
    if (lower === WEEKDAY_NAMES[i] || lower === SHORT[i] || lower.startsWith(WEEKDAY_NAMES[i]) || lower.startsWith(SHORT[i]))
      return i;
  }
  const dayNum = parseInt(lower.replace(/^day\s*/, ""), 10);
  if (Number.isFinite(dayNum) && dayNum >= 1 && dayNum <= 7) {
    return dayNum % 7;
  }
  return null;
}

function icalEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/\n/g, "\\n").replace(/,/g, "\\,");
}

function buildIcal(plan: FitnessPlan): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Recomp//Workout Plan//EN",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:Recomp Workouts",
  ];

  const now = new Date();
  const startDate = new Date(now);
  startDate.setHours(0, 0, 0, 0);
  const weeksAhead = 12;
  const defaultHour = 9;
  const durationMinutes = 60;

  for (const wd of (plan.workoutPlan?.weeklyPlan ?? []) as WorkoutDay[]) {
    const weekday = dayNameToWeekday(wd.day);
    if (weekday === null) continue;

    const descriptionParts = [wd.focus, ""].concat(
      wd.exercises.map((e) => `${e.name}: ${e.sets} × ${e.reps}${e.notes ? ` (${e.notes})` : ""}`)
    );
    const description = icalEscape(descriptionParts.join("\n"));
    const summary = icalEscape(`Reco: ${wd.focus}`);

    for (let w = 0; w < weeksAhead; w++) {
      const d = new Date(startDate);
      const currentDow = d.getDay();
      let diff = weekday - currentDow;
      if (diff < 0) diff += 7;
      d.setDate(d.getDate() + diff + w * 7);

      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const endHour = defaultHour + Math.floor(durationMinutes / 60);
      const endMin = durationMinutes % 60;

      lines.push(
        "BEGIN:VEVENT",
        `UID:recomp-${plan.id}-${wd.day}-${w}-${y}${m}${day}@recomp`,
        `DTSTAMP:${now.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
        `DTSTART:${y}${m}${day}T${String(defaultHour).padStart(2, "0")}0000`,
        `DTEND:${y}${m}${day}T${String(endHour).padStart(2, "0")}${String(endMin).padStart(2, "0")}00`,
        `SUMMARY:${summary}`,
        `DESCRIPTION:${description}`,
        "END:VEVENT"
      );
    }
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return new NextResponse("Missing token", { status: 400 });
  }

  const userId = await dbGetUserIdByCalendarToken(token);
  if (!userId) {
    return new NextResponse("Invalid or expired link", { status: 404 });
  }

  const plan = await dbGetPlan(userId);
  if (!plan?.workoutPlan?.weeklyPlan?.length) {
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Recomp//Workout Plan//EN",
      "X-WR-CALNAME:Recomp Workouts",
      "END:VCALENDAR",
    ];
    return new NextResponse(lines.join("\r\n"), {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Cache-Control": "private, max-age=300",
      },
    });
  }

  const ical = buildIcal(plan);

  return new NextResponse(ical, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="recomp-workouts.ics"',
      "Cache-Control": "private, max-age=300",
    },
  });
}
