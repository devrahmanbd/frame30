import { useCallback, useEffect, useRef, useState } from "react";
import { capturePosOrderFn } from "@/lib/pos.functions";

export type QueuedTender = {
  method: "cash" | "card" | "cod";
  amountMinorInt: number;
  tenderedMinorInt?: number;
};

export type QueuedCapture = {
  clientId: string;
  sessionId: string | null;
  tenders: QueuedTender[];
  discountMinorInt: number;
  customerName: string | null;
  customerPhone: string | null;
  addressLine: string | null;
  city: string | null;
  capturedAt: string;
  totalMinorInt: number;
  lines: { variantId: string; quantity: number }[];
  error?: string | null;
  attempts?: number;
  nextAttemptAt?: number;
};

const KEY = "framique.pos.queue";
const MAX_ATTEMPTS = 8;
/** Exponential backoff so a failing till does not hammer the server. */
const BACKOFF_MS = [0, 5_000, 15_000, 45_000, 120_000, 300_000, 600_000, 1_800_000];

function read(): QueuedCapture[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as QueuedCapture[];
  } catch {
    return [];
  }
}

function write(items: QueuedCapture[]) {
  window.localStorage.setItem(KEY, JSON.stringify(items));
}

export function newClientId() {
  return `pos-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function usePosQueue(onSynced?: () => void) {
  const [queue, setQueue] = useState<QueuedCapture[]>([]);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    setQueue(read());
    setOnline(navigator.onLine);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  const enqueue = useCallback((item: QueuedCapture) => {
    const next = [...read(), { ...item, attempts: 0, nextAttemptAt: 0 }];
    write(next);
    setQueue(next);
  }, []);

  /** Give up on one poisoned sale without blocking the rest of the queue. */
  const drop = useCallback((clientId: string) => {
    const next = read().filter((i) => i.clientId !== clientId);
    write(next);
    setQueue(next);
  }, []);

  const sync = useCallback(
    async (force = false) => {
      if (busy.current || !navigator.onLine) return;
      const pending = read();
      if (pending.length === 0) return;
      busy.current = true;
      setSyncing(true);
      const now = Date.now();
      const remaining: QueuedCapture[] = [];
      let synced = 0;

      for (const item of pending) {
        const due = force || !item.nextAttemptAt || item.nextAttemptAt <= now;
        if (!due || (item.attempts ?? 0) >= MAX_ATTEMPTS) {
          remaining.push(item);
          continue;
        }
        try {
          // The clientId is the server idempotency key: a retry after a lost
          // response returns the original sale instead of charging twice.
          await capturePosOrderFn({
            data: {
              clientId: item.clientId,
              sessionId: item.sessionId,
              origin: "offline",
              tenders: item.tenders,
              discountMinorInt: item.discountMinorInt,
              customerName: item.customerName,
              customerPhone: item.customerPhone,
              addressLine: item.addressLine,
              city: item.city,
              capturedAt: item.capturedAt,
              lines: item.lines,
            },
          });
          synced += 1;
        } catch (error) {
          const attempts = (item.attempts ?? 0) + 1;
          remaining.push({
            ...item,
            attempts,
            nextAttemptAt: Date.now() + (BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)] ?? 0),
            error: error instanceof Error ? error.message : "sync failed",
          });
        }
      }

      write(remaining);
      setQueue(remaining);
      busy.current = false;
      setSyncing(false);
      if (synced > 0) onSynced?.();
    },
    [onSynced],
  );

  useEffect(() => {
    const id = window.setInterval(() => void sync(), 20000);
    return () => window.clearInterval(id);
  }, [sync]);

  useEffect(() => {
    if (online) void sync(true);
  }, [online, sync]);

  const blocked = queue.filter((i) => (i.attempts ?? 0) >= MAX_ATTEMPTS);

  return { queue, blocked, online, syncing, enqueue, sync, drop, maxAttempts: MAX_ATTEMPTS };
}
