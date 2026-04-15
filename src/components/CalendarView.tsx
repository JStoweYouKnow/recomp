"use client";

import { useMemo, useState } from "react";
import { getTodayLocal, toLocalDateString } from "@/lib/date-utils";

type ViewMode = "month" | "week" | "day";

const DAY_NAMES_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_NAMES_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/* ── Helpers ── */

function toIso(d: Date): string {
  return toLocalDateString(d);
}

function noon(iso: string): Date {
  return new Date(iso + "T12:00:00");
}

/** Monday-based day index: Mon=0 … Sun=6 */
function mondayIdx(d: Date): number {
  const dow = d.getDay(); // 0=Sun
  return dow === 0 ? 6 : dow - 1;
}

function getMonday(d: Date): Date {
  const m = new Date(d);
  m.setDate(d.getDate() - mondayIdx(d));
  return m;
}

function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/* ── Shared arrow button ── */

function NavBtn({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--surface-elevated)] hover:text-[var(--foreground)] transition-colors flex-shrink-0"
      aria-label={label}
    >
      {children}
    </button>
  );
}

const ChevronLeft = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
  </svg>
);
const ChevronRight = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
);

/* ── Day cell (shared between month and week) ── */

function DayCell({
  iso,
  dayNum,
  isSelected,
  isToday,
  isMuted,
  hasDot,
  count,
  onClick,
  size = "sm",
}: {
  iso: string;
  dayNum: number;
  isSelected: boolean;
  isToday: boolean;
  isMuted: boolean;
  hasDot: boolean;
  count?: number;
  onClick: () => void;
  size?: "sm" | "md";
}) {
  const h = size === "md" ? "h-14" : "h-10";
  return (
    <button
      key={iso}
      onClick={onClick}
      className={`
        relative flex flex-col items-center justify-center rounded-lg ${h} transition-all
        ${isSelected
          ? "bg-[var(--accent)] text-white shadow-sm ring-2 ring-[var(--accent)]/40 ring-offset-1 ring-offset-[var(--surface)]"
          : isToday
            ? "bg-[var(--accent)]/10 text-[var(--accent)] font-semibold ring-1 ring-[var(--accent)]/30"
            : isMuted
              ? "text-[var(--border)] hover:bg-[var(--surface-elevated)] hover:text-[var(--muted)] hover:ring-1 hover:ring-[var(--border)]"
              : "text-[var(--foreground)] hover:bg-[var(--surface-elevated)] hover:ring-1 hover:ring-[var(--border-soft)]"
        }
      `}
      aria-label={`${iso}${isToday ? " (today)" : ""}`}
      aria-pressed={isSelected}
    >
      <span className={`tabular-nums leading-none ${size === "md" ? "text-sm font-semibold" : "text-xs font-medium"}`}>
        {dayNum}
      </span>
      {/* Dot + optional count */}
      {(hasDot || (count !== undefined && count > 0)) && (
        <span className="mt-0.5 flex items-center gap-0.5">
          <span
            className={`h-1 w-1 rounded-full ${isSelected ? "bg-white" : "bg-[var(--accent)]"}`}
            aria-hidden="true"
          />
          {count !== undefined && count > 0 && (
            <span className={`text-[8px] leading-none font-medium ${isSelected ? "text-white/80" : "text-[var(--accent)]"}`}>
              {count}
            </span>
          )}
        </span>
      )}
    </button>
  );
}

/* ── Month Grid View ── */

function MonthView({
  selectedDate,
  today,
  onSelectDate,
  dotDates,
  dateCounts,
}: {
  selectedDate: string;
  today: string;
  onSelectDate: (d: string) => void;
  dotDates?: Set<string>;
  dateCounts?: Map<string, number>;
}) {
  const sel = noon(selectedDate);

  const shift = (dir: -1 | 1) => {
    const d = new Date(sel);
    d.setMonth(d.getMonth() + dir);
    onSelectDate(toIso(d));
  };

  const monthLabel = sel.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  // Build grid: start from the Monday of the week containing the 1st
  const grid = useMemo(() => {
    const first = new Date(sel.getFullYear(), sel.getMonth(), 1, 12);
    const gridStart = getMonday(first);
    const cells: { iso: string; dayNum: number; inMonth: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      cells.push({
        iso: toIso(d),
        dayNum: d.getDate(),
        inMonth: isSameMonth(d, sel),
      });
    }
    // Trim trailing full week if all out of month
    while (cells.length > 35 && cells.slice(-7).every((c) => !c.inMonth)) {
      cells.splice(-7);
    }
    return cells;
  }, [sel]);

  return (
    <div>
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <NavBtn onClick={() => shift(-1)} label="Previous month"><ChevronLeft /></NavBtn>
        <span className="text-sm font-semibold">{monthLabel}</span>
        <NavBtn onClick={() => shift(1)} label="Next month"><ChevronRight /></NavBtn>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAY_NAMES_SHORT.map((n) => (
          <div key={n} className="text-center text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
            {n}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1">
        {grid.map((c) => (
          <DayCell
            key={c.iso}
            iso={c.iso}
            dayNum={c.dayNum}
            isSelected={c.iso === selectedDate}
            isToday={c.iso === today}
            isMuted={!c.inMonth}
            hasDot={dotDates?.has(c.iso) ?? false}
            count={dateCounts?.get(c.iso)}
            onClick={() => onSelectDate(c.iso)}
            size="sm"
          />
        ))}
      </div>
    </div>
  );
}

/* ── Week View ── */

function WeekView({
  selectedDate,
  today,
  onSelectDate,
  dotDates,
  dateCounts,
}: {
  selectedDate: string;
  today: string;
  onSelectDate: (d: string) => void;
  dotDates?: Set<string>;
  dateCounts?: Map<string, number>;
}) {
  const sel = noon(selectedDate);
  const monday = getMonday(sel);

  const shift = (dir: -1 | 1) => {
    const d = new Date(sel);
    d.setDate(d.getDate() + dir * 7);
    onSelectDate(toIso(d));
  };

  const weekDays = useMemo(() => {
    const days: { iso: string; dayNum: number; dayName: string; monthDay: string }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      days.push({
        iso: toIso(d),
        dayNum: d.getDate(),
        dayName: DAY_NAMES_SHORT[i],
        monthDay: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      });
    }
    return days;
  }, [monday]);

  const rangeLabel = `${weekDays[0].monthDay} – ${weekDays[6].monthDay}`;

  return (
    <div>
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <NavBtn onClick={() => shift(-1)} label="Previous week"><ChevronLeft /></NavBtn>
        <span className="text-sm font-semibold">{rangeLabel}</span>
        <NavBtn onClick={() => shift(1)} label="Next week"><ChevronRight /></NavBtn>
      </div>

      {/* Week grid */}
      <div className="grid grid-cols-7 gap-1.5">
        {weekDays.map((d) => {
          const isSelected = d.iso === selectedDate;
          const isToday = d.iso === today;
          const hasDot = dotDates?.has(d.iso) ?? false;
          const count = dateCounts?.get(d.iso);
          return (
            <button
              key={d.iso}
              onClick={() => onSelectDate(d.iso)}
              className={`
                flex flex-col items-center gap-1 rounded-xl px-1 py-2.5 transition-all
                ${isSelected
                  ? "bg-[var(--accent)] text-white shadow-sm"
                  : isToday
                    ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                    : "text-[var(--muted)] hover:bg-[var(--surface-elevated)] hover:text-[var(--foreground)]"
                }
              `}
              aria-label={`${d.dayName} ${d.monthDay}${isToday ? " (today)" : ""}`}
              aria-pressed={isSelected}
            >
              <span className="text-[10px] font-medium uppercase tracking-wide leading-none">
                {d.dayName}
              </span>
              <span className="text-lg font-bold leading-none tabular-nums">
                {d.dayNum}
              </span>
              {/* Dot / count */}
              <span className="flex items-center gap-0.5 h-3">
                {(hasDot || (count !== undefined && count > 0)) && (
                  <>
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${isSelected ? "bg-white" : "bg-[var(--accent)]"}`}
                      aria-hidden="true"
                    />
                    {count !== undefined && count > 0 && (
                      <span className={`text-[9px] leading-none font-semibold ${isSelected ? "text-white/80" : "text-[var(--accent)]"}`}>
                        {count}
                      </span>
                    )}
                  </>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Day View ── */

function DayView({
  selectedDate,
  today,
  onSelectDate,
  dotDates,
  dateCounts,
  daySummary,
}: {
  selectedDate: string;
  today: string;
  onSelectDate: (d: string) => void;
  dotDates?: Set<string>;
  dateCounts?: Map<string, number>;
  daySummary?: React.ReactNode;
}) {
  const sel = noon(selectedDate);
  const isToday = selectedDate === today;

  const shift = (dir: -1 | 1) => {
    const d = new Date(sel);
    d.setDate(d.getDate() + dir);
    onSelectDate(toIso(d));
  };

  const dayLabel = isToday
    ? "Today"
    : sel.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  const fullDayName = DAY_NAMES_FULL[mondayIdx(sel)];
  const hasDot = dotDates?.has(selectedDate) ?? false;
  const count = dateCounts?.get(selectedDate);

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <NavBtn onClick={() => shift(-1)} label="Previous day"><ChevronLeft /></NavBtn>
        <div className="text-center">
          <span className="text-sm font-semibold">{dayLabel}</span>
          {!isToday && (
            <p className="text-[10px] text-[var(--muted)]">{fullDayName}</p>
          )}
        </div>
        <NavBtn onClick={() => shift(1)} label="Next day"><ChevronRight /></NavBtn>
      </div>

      {/* Day summary card */}
      <div className={`rounded-xl border p-4 text-center transition-colors ${
        isToday
          ? "border-[var(--accent)]/30 bg-[var(--accent)]/5"
          : "border-[var(--border-soft)] bg-[var(--surface-elevated)]"
      }`}>
        <p className="text-3xl font-bold tabular-nums">{sel.getDate()}</p>
        <p className="text-xs text-[var(--muted)] mt-0.5">
          {sel.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </p>
        {(hasDot || (count !== undefined && count > 0)) && (
          <div className="mt-2 flex items-center justify-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[var(--accent)]" aria-hidden="true" />
            {count !== undefined && count > 0 && (
              <span className="text-xs font-semibold text-[var(--accent)]">
                {count} {count === 1 ? "entry" : "entries"}
              </span>
            )}
          </div>
        )}
        {daySummary && <div className="mt-3 border-t border-[var(--border-soft)] pt-3">{daySummary}</div>}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   CalendarView — main exported component
   ══════════════════════════════════════════ */

export function CalendarView({
  selectedDate,
  onSelectDate,
  dotDates,
  dateCounts,
  daySummary,
  defaultView = "week",
}: {
  selectedDate: string; // ISO YYYY-MM-DD
  onSelectDate: (date: string) => void;
  /** ISO dates that should show a dot indicator */
  dotDates?: Set<string>;
  /** ISO date → count for badge numbers */
  dateCounts?: Map<string, number>;
  /** Optional extra content rendered inside the Day view card */
  daySummary?: React.ReactNode;
  defaultView?: ViewMode;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>(defaultView);
  const today = getTodayLocal();

  const viewOptions: { id: ViewMode; label: string }[] = [
    { id: "month", label: "Month" },
    { id: "week", label: "Week" },
    { id: "day", label: "Day" },
  ];

  return (
    <div className="space-y-3">
      {/* View mode toggle + Today shortcut */}
      <div className="flex items-center justify-between">
        <div className="flex rounded-lg bg-[var(--surface-elevated)] p-0.5">
          {viewOptions.map((v) => (
            <button
              key={v.id}
              onClick={() => setViewMode(v.id)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
                viewMode === v.id
                  ? "bg-[var(--accent)] text-white shadow-sm"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>

        {selectedDate !== today && (
          <button
            onClick={() => onSelectDate(today)}
            className="rounded-md bg-[var(--accent)]/10 px-2.5 py-1 text-[10px] font-semibold text-[var(--accent)] hover:bg-[var(--accent)]/20 transition-colors"
          >
            Today
          </button>
        )}
      </div>

      {/* Active view */}
      {viewMode === "month" && (
        <MonthView
          selectedDate={selectedDate}
          today={today}
          onSelectDate={onSelectDate}
          dotDates={dotDates}
          dateCounts={dateCounts}
        />
      )}
      {viewMode === "week" && (
        <WeekView
          selectedDate={selectedDate}
          today={today}
          onSelectDate={onSelectDate}
          dotDates={dotDates}
          dateCounts={dateCounts}
        />
      )}
      {viewMode === "day" && (
        <DayView
          selectedDate={selectedDate}
          today={today}
          onSelectDate={onSelectDate}
          dotDates={dotDates}
          dateCounts={dateCounts}
          daySummary={daySummary}
        />
      )}
    </div>
  );
}

/* Re-export the old name as an alias so existing imports don't break */
export { CalendarView as CalendarStrip };
