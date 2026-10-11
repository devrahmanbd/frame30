/**
 * Per-frame flood guard for the widget sandbox bridge.
 *
 * The frame chooses its own message `id`s and can post at will, so the host
 * must bound the work one frame can force: at most 30 handled messages per
 * rolling 10-second window, and no `id` may be handled twice within the frame
 * lifetime (replays would otherwise clobber in-flight `pending` replies).
 *
 * Pure state machine — no DOM, no timers — so it is unit-testable under node
 * and the `WidgetSandbox` host handler (which cannot be driven under node, no
 * jsdom) delegates to it. Rejected messages never reach `onCall`.
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
