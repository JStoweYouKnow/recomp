import { isJudgeMode } from "@/lib/judgeMode";

export type JudgeTraceStatus = "ok" | "error" | "fallback";

export interface JudgeTraceEntry {
  id: string;
  at: string;
  action: string;
  service: string;
  model?: string;
  status: JudgeTraceStatus;
  durationMs?: number;
  detail?: string;
}

const MAX_TRACE_ENTRIES = 200;
const TRACE_STORE_KEY = "__recomp_judge_trace_store__";

function getStore(): JudgeTraceEntry[] {
  const g = globalThis as Record<string, unknown>;
  if (!Array.isArray(g[TRACE_STORE_KEY])) {
    g[TRACE_STORE_KEY] = [];
  }
  return g[TRACE_STORE_KEY] as JudgeTraceEntry[];
}

function nextId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function recordJudgeTrace(
  entry: Omit<JudgeTraceEntry, "id" | "at">
): void {
  if (!isJudgeMode()) return;
  const store = getStore();
  store.unshift({
    id: nextId(),
    at: new Date().toISOString(),
    ...entry,
  });
  if (store.length > MAX_TRACE_ENTRIES) {
    store.length = MAX_TRACE_ENTRIES;
  }
}

export function getJudgeTraceEntries(limit = 100): JudgeTraceEntry[] {
  const safeLimit = Math.max(1, Math.min(200, limit));
  return getStore().slice(0, safeLimit);
}

export function clearJudgeTraceEntries(): void {
  getStore().length = 0;
}
