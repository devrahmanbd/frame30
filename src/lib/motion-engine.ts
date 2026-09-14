/**
 * Phase 10.1 — the lazy motion engine.
 *
 * One engine for the whole site (GSAP + ScrollTrigger) and it is *never* in the
 * initial bundle: the import lives inside a function, so the chunk is fetched
 * on the first scroll-driven section that actually needs it, after hydration,
 * and only at `full` intent. Everything else on the page (reveal, stagger,
 * counters, marquee) is CSS/rAF and works with the engine absent.
 *
 * The load is treated like any other network dependency:
 *   • a timeout, because a hung chunk request must not leave a section pinned;
 *   • bounded retries with jittered backoff;
 *   • a circuit breaker, so a broken deploy costs one round of retries per
 *     session rather than one per component;
 *   • structured logs at every state transition;
 *   • a *degraded* mode that resolves to `null` and lets every caller render
 *     the static, final layout. A failed animation library is never a blank
 *     screen.
 */
import {
  ENGINE_LOAD_POLICY,
  backoffDelayMs,
  shouldRetryLoad,
  type EngineLoadPolicy,
} from "./motion-policy";
import { motionLog } from "./motion-runtime";

export type MotionEngine = {
  gsap: typeof import("gsap")["gsap"];
  ScrollTrigger: typeof import("gsap/ScrollTrigger")["ScrollTrigger"];
};

export type EngineState = "idle" | "loading" | "ready" | "degraded";

let state: EngineState = "idle";
let engine: MotionEngine | null = null;
let inflight: Promise<MotionEngine | null> | null = null;
let consecutiveFailures = 0;

export function motionEngineState(): EngineState {
  return state;
}

/** Test seam: reset the module singleton between cases. */
export function __resetMotionEngine() {
  state = "idle";
  engine = null;
  inflight = null;
  consecutiveFailures = 0;
}

function timeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function importEngine(): Promise<MotionEngine> {
  const [{ gsap }, { ScrollTrigger }] = await Promise.all([
    import("gsap"),
    import("gsap/ScrollTrigger"),
  ]);
  gsap.registerPlugin(ScrollTrigger);
  return { gsap, ScrollTrigger };
}

export type LoadOptions = {
  policy?: EngineLoadPolicy;
  /** Injected for tests; defaults to the real dynamic import. */
  loader?: () => Promise<MotionEngine>;
};

/**
 * Returns the engine, or `null` when motion must degrade. Concurrent callers
 * share one in-flight load — ten pinned sections cost one network request.
 */
export async function loadMotionEngine(options: LoadOptions = {}): Promise<MotionEngine | null> {
  if (state === "ready" && engine) return engine;
  if (state === "degraded") return null;
  if (inflight) return inflight;
  if (typeof window === "undefined") return null;

  const policy = options.policy ?? ENGINE_LOAD_POLICY;
  const loader = options.loader ?? importEngine;
  state = "loading";
  const startedAt = Date.now();

  inflight = (async () => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        const loaded = await timeout(loader(), policy.timeoutMs, "motion engine import");
        engine = loaded;
        state = "ready";
        consecutiveFailures = 0;
        motionLog("info", "engine.ready", { attempt, ms: Date.now() - startedAt });
        return loaded;
      } catch (error) {
        consecutiveFailures += 1;
        const message = error instanceof Error ? error.message : "unknown";
        if (!shouldRetryLoad(attempt, policy) || consecutiveFailures >= policy.breakerThreshold) {
          state = "degraded";
          motionLog("error", "engine.degraded", {
            attempt,
            failures: consecutiveFailures,
            ms: Date.now() - startedAt,
            message,
          });
          return null;
        }
        const wait = backoffDelayMs(attempt, policy);
        motionLog("warn", "engine.retry", { attempt, wait, message });
        await sleep(wait);
      }
    }
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

export type EngineScope = { dispose: () => void };

/**
 * Run `setup` with the engine once it is available and return a disposer that
 * is safe to call before the load resolves (strict mode, fast unmounts).
 */

export function withEngine(
  setup: (engine: MotionEngine) => (() => void) | void,
  options: LoadOptions = {},
): EngineScope {
  let cancelled = false;
  let cleanup: (() => void) | void;

  void loadMotionEngine(options).then((loaded) => {
    if (cancelled || !loaded) return;
    try {
      cleanup = setup(loaded);
    } catch (error) {
      motionLog("error", "engine.setup_failed", {
        message: error instanceof Error ? error.message : "unknown",
      });
    }
  });

  return {
    dispose() {
      cancelled = true;
      try {
        cleanup?.();
      } catch (error) {
        motionLog("warn", "engine.cleanup_failed", {
          message: error instanceof Error ? error.message : "unknown",
        });
      }
    },
  };
}
