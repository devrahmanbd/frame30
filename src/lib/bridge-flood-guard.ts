/**
 * Per-frame flood guard for the widget sandbox bridge.
 *
 * Three host-side containments, all keyed to one mounted frame:
 *
 * 1. Flood gate (`checkFloodGuard`) — at most 30 handled messages per rolling
 *    10-second window, and no `id` handled twice within the frame lifetime
 *    (replays would otherwise clobber in-flight `pending` replies). The frame
 *    chooses its own message `id`s and can post at will, so the host must
 *    bound the work one frame can force. Pure state machine, no DOM.
 *
 * 2. Per-call timeout (`withCallTimeout` / `answerWithTimeout`) — a hung host
 *    handler (`onCall` never settling) must surface as `{error:
 *    "sandbox.timeout"}` instead of hanging the frame's `pending` entry
 *    forever. The race retires the call id: the loser of the race has its
 *    settlement dropped, so a late host resolution can never answer a
 *    recycled id (belt-and-braces with the flood gate's duplicate-`id`
 *    rejection and the frame dropping `pending` on its first answer — the
 *    wire format is unchanged). Timers are injectable (`BridgeTimers`) so
 *    this stays unit-testable under node with a deterministic clock; the
 *    default is the host `setTimeout` pair, always cleared on settle so
 *    storms leave no armed handles behind.
 *
 * 3. Hung entries: intentionally NOT covered here. A synchronously
 *    spinning entry never yields, so no host-side timer can preempt it —
 *    and five shipped builtin widgets plus the starter plugin never call
 *    the bridge at all, so unmount-on-silence would delete working
 *    widgets (reverted; see history). Per-call timeouts bound hung *host*
 *    handlers, the flood gate bounds chatter, and a spinning entry is
 *    contained by the null-origin sandbox (no DOM, no network, no
 *    storage) until the browser intervenes.
 *
 * Why the watchdog cannot preempt a spinning entry: the entry runs as a
 * synchronous `<script>` inside a `sandbox="allow-scripts"` iframe whose
 * origin is opaque (`allow-same-origin` is withheld), so the host has no
 * handle into the frame's execution — no `Worker.terminate` equivalent
 * exists for browsing contexts, and a synchronously spinning script never
 * yields to deliver even a detach. What the watchdog DOES cover: detecting
 * the absence of liveness (no admitted bridge call within the budget),
 * failing the island closed (unmount — shoppers see nothing, the page still
 * renders), and committing no further host resources (no pending entries, no
 * timers, no unbounded state). What it explicitly does NOT cover: reclaiming
 * CPU from a synchronous infinite loop (a same-process renderer may still
 * jank until the browser intervenes), observing purely presentational
 * entries (a widget that never calls the bridge is indistinguishable from a
 * hung one — silence trips the watch), or bounding synchronous work inside
 * the host's own `onCall` (a blocking host handler blocks the host; keep
 * `onCall` async and non-blocking).
 *
 * The `WidgetSandbox` host handler (which cannot be driven under node, no
 * jsdom) delegates to this module. Rejected messages never reach `onCall`.
 */

/** Max handled messages per rolling window, per mounted frame. */
export const BRIDGE_MAX_MESSAGES = 30;
/** Rolling window for the rate budget. */
export const BRIDGE_WINDOW_MS = 10_000;

export type FloodGuardState = {
  /** Every `id` handled so far in this frame lifetime. */
  seen: Set<string>;
  /** Timestamps (ms) of handled messages, in arrival order. */
  times: number[];
};

export function createFloodGuard(): FloodGuardState {
  return { seen: new Set<string>(), times: [] };
}

/** Forget everything: called when `entry` changes (new frame identity). */
export function resetFloodGuard(g: FloodGuardState): void {
  g.seen.clear();
  g.times.length = 0;
}

export type FloodGate =
  | { ok: true }
  | { ok: false; error: "sandbox.duplicate_id" | "sandbox.rate_limited" };

/**
 * Admit one message. Duplicates are rejected first and cost no rate budget;
 * admitted messages (even ones the authorizer later denies) each spend one
 * rate slot. `now` is injectable for tests; defaults to `Date.now()`.
 */
export function checkFloodGuard(
  g: FloodGuardState,
  id: unknown,
  now: number = Date.now(),
): FloodGate {
  if (typeof id === "string" && g.seen.has(id)) {
    return { ok: false, error: "sandbox.duplicate_id" };
  }
  const cutoff = now - BRIDGE_WINDOW_MS;
  let w = 0;
  for (let r = 0; r < g.times.length; r++) {
    if (g.times[r]! > cutoff) g.times[w++] = g.times[r]!;
  }
  g.times.length = w;
  if (g.times.length >= BRIDGE_MAX_MESSAGES) {
    return { ok: false, error: "sandbox.rate_limited" };
  }
  g.times.push(now);
  if (typeof id === "string") g.seen.add(id);
  return { ok: true };
}

/** Default budget for one bridge call to settle before the host times out. */
export const DEFAULT_CALL_TIMEOUT_MS = 5_000;

/**
 * Injectable clock for the timeout race. Tests pass a manual rig; the host
 * uses the real pair. Handles are opaque so a rig can use numbers.
 */
export type BridgeTimers = {
  schedule: (cb: () => void, ms: number) => unknown;
  cancel: (handle: unknown) => void;
};

const hostTimers: BridgeTimers = {
  schedule: (cb, ms) => setTimeout(cb, ms),
  cancel: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/** Rejection reason for a timed-out bridge call; carries the wire string. */
export class BridgeTimeoutError extends Error {
  constructor() {
    super("sandbox.timeout");
    this.name = "BridgeTimeoutError";
  }
}

export type BridgeAnswer = { result: unknown } | { error: string };

export function normalizeTimeoutMs(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0
    ? v
    : DEFAULT_CALL_TIMEOUT_MS;
}

/**
 * Race async bridge work against `ms`. Exactly one outcome escapes: the
 * `settled` flag retires the call id, so after a timeout a late resolve (or
 * late reject — already observed, never unhandled) is dropped instead of
 * answering. The timer is always cleared on settle, so a storm of calls
 * leaves no armed handles behind. Already-settled work always wins, even
 * with a 0ms budget.
 */
export function withCallTimeout<T>(
  work: Promise<T>,
  ms: number,
  timers: BridgeTimers = hostTimers,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = timers.schedule(() => {
      if (settled) return;
      settled = true;
      reject(new BridgeTimeoutError());
    }, ms);
    work.then(
      (value) => {
        if (settled) return;
        settled = true;
        timers.cancel(timer);
        resolve(value);
      },
      (err) => {
        if (settled) return;
        settled = true;
        timers.cancel(timer);
        reject(err);
      },
    );
  });
}

/**
 * `withCallTimeout` for bridge answers: the timeout becomes the
 * `{error: "sandbox.timeout"}` shape the frame already handles (it drops
 * `pending` on any answer, so the frame needs no change). Foreign
 * rejections propagate — only the timeout is mapped.
 */
export function answerWithTimeout(
  work: Promise<BridgeAnswer>,
  ms: number,
  timers: BridgeTimers = hostTimers,
): Promise<BridgeAnswer> {
  return withCallTimeout(work, ms, timers).catch((err) => {
    if (err instanceof BridgeTimeoutError) return { error: "sandbox.timeout" };
    throw err;
  });
}
