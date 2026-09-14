/**
 * Phase 10.1 — the motion policy.
 *
 * Every rule that decides *whether*, *how long* and *how far* something moves
 * lives here, as pure functions with no DOM, no timers and no imports. The
 * runtime (`motion-runtime.ts`), the engine loader (`motion-engine.ts`) and the
 * React primitives under `src/components/public/motion/` are thin shells over
 * these decisions, which is what makes the motion layer testable in Node and
 * auditable by the contract gate.
 *
 * The product rules this file encodes:
 *   • motion is a garnish on a fast page — it never gates content;
 *   • `prefers-reduced-motion`, Save-Data, low memory and low core counts all
 *     downgrade motion, and a downgrade never hides anything;
 *   • animation work is budgeted: a page may not run an unbounded number of
 *     concurrent animations, and the overflow degrades to the final state
 *     rather than queueing forever;
 *   • the lazy engine load is a network call, so it gets a timeout, bounded
 *     retries with jittered backoff, a circuit breaker and structured logs.
 */

/* ------------------------------------------------------------------ tokens */

export const MOTION_TOKENS = {
  /** Milliseconds. Nothing on a marketing page may exceed `slow` for entrance. */
  /**
   * Milliseconds. Nothing on a marketing page may exceed `slow` for entrance.
   * `reveal` is the §10.4 entrance token (480ms) and is what `Reveal` defaults
   * to; `base` stays as the shorter token for UI affordances (hovers, toggles)
   * where 480ms would feel sluggish rather than considered.
   */
  duration: { instant: 0, fast: 180, base: 320, reveal: 480, slow: 520, counter: 1_400 },
  /** CSS timing functions. One family, so the whole site feels like one hand. */
  easing: {
    out: "cubic-bezier(0.22, 1, 0.36, 1)",
    inOut: "cubic-bezier(0.65, 0, 0.35, 1)",
    entrance: "cubic-bezier(0.16, 1, 0.3, 1)",
  },
  /** Pixels. Entrance travel is short; long travel reads as jank on mobile. */
  distance: { rise: 16, riseLg: 28, parallaxMax: 64, magneticMax: 10 },
  stagger: { stepMs: 60, maxTotalMs: 900, maxChildren: 24 },
  marquee: { minMs: 12_000, maxMs: 90_000, speedPxPerSec: 40 },
  /**
   * Atmosphere drift (TODO §10.4): a hero aurora loops in 24–38s. Faster reads
   * as movement the eye tracks instead of a field it sits in; slower looks
   * static while still paying for a composited layer every frame.
   */
  drift: { minMs: 24_000, maxMs: 38_000, defaultMs: 31_000 },
  /** The magnetic CTA is a desktop-with-cursor affordance only. */
  magnetic: { minViewportPx: 1_024 },
} as const;

export type MotionIntent = "full" | "reduced" | "off";

export type MotionEnvironment = {
  /** `(prefers-reduced-motion: reduce)` matched. */
  prefersReduced?: boolean;
  /** `data-motion="none"` on an ancestor, or an explicit product override. */
  override?: MotionIntent | null;
  /** `navigator.connection.saveData`. */
  saveData?: boolean;
  /** `navigator.deviceMemory`, in GB. */
  deviceMemoryGb?: number | null;
  /** `navigator.hardwareConcurrency`. */
  hardwareConcurrency?: number | null;
  /** No JS-driven motion before hydration; SSR always resolves to `off`. */
  hydrated?: boolean;
};

/** The single decision point. Everything else asks this. */
export function resolveIntent(env: MotionEnvironment = {}): MotionIntent {
  if (env.override === "off" || env.override === "reduced" || env.override === "full") {
    // An explicit `full` override still loses to the OS accessibility setting:
    // a product opinion may not overrule a user's vestibular preference.
    if (env.override === "full" && env.prefersReduced) return "reduced";
    return env.override;
  }
  if (env.hydrated === false) return "off";
  if (env.prefersReduced) return "reduced";
  if (env.saveData) return "reduced";
  if (typeof env.deviceMemoryGb === "number" && env.deviceMemoryGb > 0 && env.deviceMemoryGb < 2) return "reduced";
  if (typeof env.hardwareConcurrency === "number" && env.hardwareConcurrency > 0 && env.hardwareConcurrency <= 2) {
    return "reduced";
  }
  return "full";
}

/** `reduced` keeps opacity cross-fades; `off` renders the final state at once. */
export function allowsTransform(intent: MotionIntent) {
  return intent === "full";
}
export function allowsOpacity(intent: MotionIntent) {
  return intent !== "off";
}
/** Heavy media (Lottie/Rive/Spline/shader) only ever runs at full intent. */
export function allowsHeavyMedia(intent: MotionIntent) {
  return intent === "full";
}

/**
 * Whether a magnetic CTA may follow the pointer (TODO §10.4).
 *
 * Three conditions, all of them required, and the reasoning for each:
 *   • full intent — a pointer-follow is pure decoration, so it is the first
 *     thing a reduced-motion or Save-Data visitor loses;
 *   • ≥1024px — below that the layout is single-column and the visitor is very
 *     likely touching the screen, where a moving target is a mis-tap;
 *   • a fine pointer — a magnet with no cursor to attract is jitter, and on a
 *     hybrid device (touch laptop) the coarse branch is the safe default.
 *
 * Pure, so the gate and the unit tests assert the same decision the component
 * makes rather than a re-implementation of it.
 */
export function allowsMagnetic(
  intent: MotionIntent,
  viewportWidthPx: number,
  finePointer: boolean,
  minViewportPx: number = MOTION_TOKENS.magnetic.minViewportPx,
) {
  if (intent !== "full") return false;
  if (!finePointer) return false;
  if (!Number.isFinite(viewportWidthPx) || viewportWidthPx < minViewportPx) return false;
  return true;
}

/**
 * Drift duration for an atmosphere layer, clamped into the 24–38s window.
 *
 * Layers are offset deterministically by index rather than randomly: a random
 * duration means two heroes on two routes drift differently, and "why does the
 * pricing page feel faster?" is not a question anyone can debug.
 */
export function driftDurationMs(index = 0, bounds: { minMs?: number; maxMs?: number } = {}) {
  const min = bounds.minMs ?? MOTION_TOKENS.drift.minMs;
  const max = bounds.maxMs ?? MOTION_TOKENS.drift.maxMs;
  if (max <= min) return min;
  const steps = 3;
  const i = Math.max(0, Math.floor(Number.isFinite(index) ? index : 0)) % steps;
  return Math.round(min + ((max - min) / (steps - 1)) * i);
}



/** Entrance duration for the resolved intent, in ms. */
export function entranceDuration(intent: MotionIntent, base: number = MOTION_TOKENS.duration.base) {
  if (intent === "off") return 0;
  if (intent === "reduced") return Math.min(MOTION_TOKENS.duration.fast, base);
  return clamp(base, 0, MOTION_TOKENS.duration.slow);
}

/* --------------------------------------------------------------- schedules */

export type StaggerOptions = {
  stepMs?: number;
  maxTotalMs?: number;
  maxChildren?: number;
  intent?: MotionIntent;
};

/**
 * Delays, in ms, for `count` children. The step shrinks so the last child is
 * never later than `maxTotalMs` — a 40-item grid must not take 2.4 seconds to
 * finish arriving just because someone typed `stagger={60}`.
 */
export function staggerSchedule(count: number, options: StaggerOptions = {}): number[] {
  const n = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0));
  if (n === 0) return [];
  const intent = options.intent ?? "full";
  if (intent !== "full") return new Array(n).fill(0);

  const maxChildren = Math.max(1, options.maxChildren ?? MOTION_TOKENS.stagger.maxChildren);
  const maxTotal = Math.max(0, options.maxTotalMs ?? MOTION_TOKENS.stagger.maxTotalMs);
  const requested = Math.max(0, options.stepMs ?? MOTION_TOKENS.stagger.stepMs);
  const spans = Math.max(1, Math.min(n, maxChildren) - 1);
  const step = Math.min(requested, maxTotal / spans);

  return Array.from({ length: n }, (_, i) => {
    // Children beyond the cap all share the last delay instead of trailing off
    // the end of the schedule.
    const index = Math.min(i, maxChildren - 1);
    return Math.round(index * step);
  });
}

/** Marquee cycle duration from measured content width, clamped to sane bounds. */
export function marqueeDurationMs(
  contentWidthPx: number,
  speedPxPerSec: number = MOTION_TOKENS.marquee.speedPxPerSec,
  bounds: { minMs?: number; maxMs?: number } = {},
) {
  const width = Number.isFinite(contentWidthPx) ? Math.abs(contentWidthPx) : 0;
  const speed = speedPxPerSec > 0 ? speedPxPerSec : MOTION_TOKENS.marquee.speedPxPerSec;
  const min = bounds.minMs ?? MOTION_TOKENS.marquee.minMs;
  const max = bounds.maxMs ?? MOTION_TOKENS.marquee.maxMs;
  if (width === 0) return min;
  return Math.round(clamp((width / speed) * 1_000, min, max));
}

/**
 * Parallax translation for a section, in px. `progress` is -1 (just below the
 * viewport) … 0 (centred) … 1 (just above), `depth` is 0…1.
 */
export function parallaxOffset(progress: number, depth = 0.2, max: number = MOTION_TOKENS.distance.parallaxMax) {
  const p = clamp(Number.isFinite(progress) ? progress : 0, -1, 1);
  const d = clamp(Number.isFinite(depth) ? depth : 0, 0, 1);
  return round2(clamp(p * d * max, -max, max));
}

/** Magnetic pull for a hovered CTA, clamped so the hit target never runs away. */
export function magneticOffset(
  dx: number,
  dy: number,
  rect: { width: number; height: number },
  max: number = MOTION_TOKENS.distance.magneticMax,
) {
  const w = rect.width > 0 ? rect.width : 1;
  const h = rect.height > 0 ? rect.height : 1;
  const nx = clamp((Number.isFinite(dx) ? dx : 0) / (w / 2), -1, 1);
  const ny = clamp((Number.isFinite(dy) ? dy : 0) / (h / 2), -1, 1);
  return { x: round2(nx * max), y: round2(ny * max) };
}

/* ---------------------------------------------------------------- counters */

/** Expo-out: fast commitment, long settle — reads as "counting up", not "sliding". */
export function easeOutExpo(t: number) {
  const x = clamp(Number.isFinite(t) ? t : 0, 0, 1);
  return x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
}

export function counterValueAt(
  elapsedMs: number,
  durationMs: number,
  from: number,
  to: number,
  intent: MotionIntent = "full",
) {
  if (intent !== "full" || durationMs <= 0) return to;
  const t = clamp(elapsedMs / durationMs, 0, 1);
  return from + (to - from) * easeOutExpo(t);
}

/**
 * Counters must never render a longer string mid-flight than at rest, or the
 * layout reflows on every frame. We format the *target* to learn the width and
 * pad the in-flight value to it.
 */
export function formatCounterValue(
  value: number,
  target: number,
  options: { locale?: string; maximumFractionDigits?: number; minimumFractionDigits?: number } = {},
) {
  const locale = options.locale ?? "en-US";
  const fraction = options.maximumFractionDigits ?? 0;
  const fmt = new Intl.NumberFormat(locale, {
    maximumFractionDigits: fraction,
    minimumFractionDigits: options.minimumFractionDigits ?? fraction,
  });
  const rendered = fmt.format(fraction === 0 ? Math.round(value) : value);
  const width = fmt.format(fraction === 0 ? Math.round(target) : target).length;
  return rendered.length < width ? rendered.padStart(width, "\u2007") : rendered;
}

/* ------------------------------------------------------------------ budget */

export type BudgetRejection = { id: string; reason: "budget" | "duplicate" };

/**
 * A hard cap on concurrently running JS-driven animations.
 *
 * A long marketing page can easily have 60 revealing nodes on screen after a
 * fast scroll; running them all is how a "premium" page drops 20 frames on a
 * mid-range Android. Overflow is not queued — the caller is told `false` and
 * renders the final state immediately, which is visually identical two frames
 * later and costs nothing.
 */
export class MotionBudget {
  readonly max: number;
  private readonly active = new Set<string>();
  private rejections = 0;
  private peak = 0;

  constructor(max = 12) {
    this.max = Math.max(1, Math.floor(max));
  }

  acquire(id: string): boolean {
    if (this.active.has(id)) return true;
    if (this.active.size >= this.max) {
      this.rejections += 1;
      return false;
    }
    this.active.add(id);
    this.peak = Math.max(this.peak, this.active.size);
    return true;
  }

  release(id: string) {
    this.active.delete(id);
  }

  clear() {
    this.active.clear();
  }

  get size() {
    return this.active.size;
  }

  stats() {
    return { active: this.active.size, peak: this.peak, rejected: this.rejections, max: this.max };
  }
}

/* ------------------------------------------------- engine load / retry plan */

export type EngineLoadPolicy = {
  timeoutMs: number;
  retries: number;
  baseBackoffMs: number;
  factor: number;
  maxBackoffMs: number;
  /** Consecutive failures before we stop trying for the rest of the session. */
  breakerThreshold: number;
};

export const ENGINE_LOAD_POLICY: EngineLoadPolicy = {
  timeoutMs: 4_000,
  retries: 2,
  baseBackoffMs: 300,
  factor: 2,
  maxBackoffMs: 3_000,
  breakerThreshold: 3,
};

/** Exponential backoff with full jitter, deterministic when `rand` is supplied. */
export function backoffDelayMs(attempt: number, policy: EngineLoadPolicy = ENGINE_LOAD_POLICY, rand = Math.random) {
  const n = Math.max(0, Math.floor(attempt));
  const raw = policy.baseBackoffMs * Math.pow(policy.factor, n);
  const capped = Math.min(raw, policy.maxBackoffMs);
  return Math.round(capped * (0.5 + 0.5 * clamp(rand(), 0, 1)));
}

export function shouldRetryLoad(attempt: number, policy: EngineLoadPolicy = ENGINE_LOAD_POLICY) {
  return attempt < policy.retries;
}

/* ---------------------------------------------------------------- logging */

export type MotionLogLevel = "debug" | "info" | "warn" | "error";
export type MotionLogRecord = {
  level: MotionLogLevel;
  event: string;
  scope: "motion";
  at: number;
  fields: Record<string, string | number | boolean>;
};

/** Structured, bounded, PII-free. The runtime pipes these to console/beacon. */
export function motionLogRecord(
  level: MotionLogLevel,
  event: string,
  fields: Record<string, unknown> = {},
  now = Date.now(),
): MotionLogRecord {
  const safe: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (Object.keys(safe).length >= 12) break;
    if (value === null || value === undefined) continue;
    if (typeof value === "number") safe[key] = Number.isFinite(value) ? round2(value) : 0;
    else if (typeof value === "boolean") safe[key] = value;
    else safe[key] = String(value).slice(0, 120);
  }
  return { level, event, scope: "motion", at: now, fields: safe };
}

/** Warnings and errors always report; chatty debug/info events are sampled. */
export function shouldSampleLog(level: MotionLogLevel, rate = 0.05, rand = Math.random) {
  if (level === "warn" || level === "error") return true;
  return rand() < clamp(rate, 0, 1);
}

/* ------------------------------------------------------------------ shared */

export function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
