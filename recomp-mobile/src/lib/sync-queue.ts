import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { apiFetch } from "./api";
import { captureError } from "./sentry";

const QUEUE_KEY = "recomp_sync_queue";
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

export interface SyncOperation {
  id: string;
  path: string;
  method: string;
  body: string;
  createdAt: string;
  retries: number;
}

/** Load pending operations from storage. */
async function loadQueue(): Promise<SyncOperation[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Persist queue to storage. */
async function saveQueue(queue: SyncOperation[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

/** Enqueue a mutation for later sync. Returns immediately. */
export async function enqueue(path: string, method: string, body: unknown): Promise<void> {
  const op: SyncOperation = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    path,
    method,
    body: JSON.stringify(body),
    createdAt: new Date().toISOString(),
    retries: 0,
  };
  const queue = await loadQueue();
  queue.push(op);
  await saveQueue(queue);
}

/** Get current queue length (for UI indicators). */
export async function getPendingCount(): Promise<number> {
  const queue = await loadQueue();
  return queue.length;
}

/** Process all pending operations. Returns count of successfully processed items. */
export async function flush(): Promise<number> {
  const netState = await NetInfo.fetch();
  if (!netState.isConnected) return 0;

  const queue = await loadQueue();
  if (queue.length === 0) return 0;

  let processed = 0;
  const remaining: SyncOperation[] = [];

  for (const op of queue) {
    try {
      const res = await apiFetch(op.path, {
        method: op.method,
        body: op.body,
      });

      if (res.ok) {
        processed++;
      } else if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        // Client error (not rate-limited) — drop the operation, it won't succeed on retry
        processed++;
        captureError(new Error(`Sync queue: dropped ${op.path} with status ${res.status}`), {
          operationId: op.id,
          path: op.path,
          status: res.status,
        });
      } else {
        // Server error or rate limit — retry later
        op.retries++;
        if (op.retries < MAX_RETRIES) {
          remaining.push(op);
        } else {
          captureError(new Error(`Sync queue: max retries for ${op.path}`), {
            operationId: op.id,
            path: op.path,
            retries: op.retries,
          });
        }
      }
    } catch {
      op.retries++;
      if (op.retries < MAX_RETRIES) {
        remaining.push(op);
      }
    }
  }

  await saveQueue(remaining);
  return processed;
}

/** Calculate exponential backoff delay for an operation. */
export function getBackoffDelay(retries: number): number {
  return Math.min(BASE_DELAY_MS * Math.pow(2, retries), 30000);
}

let _unsubscribe: (() => void) | null = null;

/** Start listening for connectivity changes and auto-flush when back online. */
export function startAutoSync(): void {
  if (_unsubscribe) return;

  _unsubscribe = NetInfo.addEventListener((state) => {
    if (state.isConnected) {
      // Small delay to let the connection stabilize
      setTimeout(() => flush().catch(() => {}), 2000);
    }
  });
}

/** Stop auto-sync listener. */
export function stopAutoSync(): void {
  if (_unsubscribe) {
    _unsubscribe();
    _unsubscribe = null;
  }
}
