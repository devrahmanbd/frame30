/**
 * Builder motion-effect executors — the phase 3 motion ceiling.
 *
 * Themes declare a named effect via `advMotion` (`MOTION_EFFECTS` in
 * `src/lib/builder-advanced.ts`); this module executes it. Isolation holds:
 * no theme import, no per-widget branch — one hook for every node, wired by
 * `SectionRenderer` only.
 *
 * Two effects need JavaScript and run here, behind the single sanctioned
 * engine loader (`withEngine`, dynamic gsap import only — the
 * `motion.contract.test.ts` "no static gsap import" invariant applies to this
 * file too):
 *
 *   • `count-up` — tweens a numeral on entry (IntersectionObserver-gated,
 *     exactly like reveals);
 *   • `scroll-scrub` — drives a scroll-linked drift while the node crosses
 *     the viewport (ScrollTrigger scrub).
 *
 * Everything else in the vocabulary is CSS-executed and this hook leaves it
 * alone. Content always renders settled: the from-state is applied inside the
 * engine setup, so a failed chunk, a denied budget slot, or any non-`full`
 * intent leaves the final state on screen. Reduced motion collapses to final
 * state — the hook never starts a tween for it.
 *
 * Structure mirrors `songoskriti-motion.ts`: the pure layer (mode decision,
 * plans, target parsing) is DOM-free so vitest pins it without an engine;
 * the hook is a thin client-only shell over the pure layer + `withEngine`.
 */
import { useEffect } from "react";
import { isJsEffect, type MotionEffect } from "@/lib/builder-advanced";
import { withEngine, type MotionEngine } from "@/lib/motion-engine";
import {
  MOTION_TOKENS,
  formatCounterValue,
  type MotionIntent,
} from "@/lib/motion-policy";
import {
  releaseMotionBudget,
  useMotionId,
  useMotionIntent,
  withMotionBudget,
} from "@/lib/motion-runtime";
import { useReveal } from "./reveal";

/** Descendants (or the scope itself) carrying an animated numeral. */
export const COUNT_UP_SELECTOR = "[data-count-up]";

export type FxMode = "css" | "js" | "static";

/**
 * Pure execution-mode decision. `none` and every non-`full` intent render
 * settled with no observer and no engine; JS effects animate; the rest is
 * left to the stylesheet.
 */
export function resolveFxMode(
  intent: MotionIntent,
  effect: MotionEffect,
): FxMode {
  if (effect === "none" || intent !== "full") return "static";
  return isJsEffect(effect) ? "js" : "css";
}

export type CountUpPlan = {
  targets: typeof COUNT_UP_SELECTOR;
  /** Seconds-equivalent comes from the shared counter token. */
  durationMs: number;
  ease: string;
};

/**
 * Pure count-up config. Null unless a full-intent count-up is requested —
 * reduced/off intents keep the settled figure (see `useMotionFx`).
 */
export function countUpPlan(
  intent: MotionIntent,
  effect: MotionEffect,
): CountUpPlan | null {
  if (intent !== "full" || effect !== "count-up") return null;
  return {
    targets: COUNT_UP_SELECTOR,
    durationMs: MOTION_TOKENS.duration.counter,
    ease: "expo.out",
  };
}

export type ScrollScrubPlan = {
  /** Symmetric drift (±px) across the viewport crossing. */
  travelPx: number;
  ease: string;
  start: string;
  end: string;
};

/**
 * Pure scroll-scrub config. Travel is the platform's large-rise token —
 * visible against the scroll without ever approaching the parallax ceiling —
 * and the ease is linear because the scroll position is the easing.
 */
export function scrollScrubPlan(
  intent: MotionIntent,
  effect: MotionEffect,
): ScrollScrubPlan | null {
  if (intent !== "full" || effect !== "scroll-scrub") return null;
  return {
    travelPx: MOTION_TOKENS.distance.riseLg,
    ease: "none",
    start: "top bottom",
    end: "bottom top",
  };
}

/**
 * Reads an animation target from a `data-count-to` attribute or, failing
 * that, from the element's own settled text. Grouping separators and
 * surrounding copy are tolerated; anything unparseable is null and the node
 * keeps its settled text.
 */
export function parseCountTarget(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[^0-9.\-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function fractionDigits(n: number): number {
  const text = String(n);
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : Math.min(2, text.length - dot - 1);
}

function runCountUp(
  engine: MotionEngine,
  scope: HTMLElement,
  plan: CountUpPlan,
): () => void {
  const { gsap } = engine;
  const nodes = scope.matches(plan.targets)
    ? [scope, ...Array.from(scope.querySelectorAll(plan.targets))]
    : Array.from(scope.querySelectorAll(plan.targets));
  const killers: (() => void)[] = [];
  for (const node of nodes) {
    const el = node as HTMLElement;
    const target = parseCountTarget(
      el.getAttribute("data-count-to") ?? el.textContent ?? "",
    );
    if (target === null) continue;
    const decimals = fractionDigits(target);
    const proxy = { v: 0 };
    const render = (v: number) => {
      el.textContent = formatCounterValue(v, target, {
        maximumFractionDigits: decimals,
      });
    };
    render(0);
    const tween = gsap.to(proxy, {
      v: target,
      duration: plan.durationMs / 1000,
      ease: plan.ease,
      overwrite: "auto",
      onUpdate: () => render(proxy.v),
      onComplete: () => render(target),
    });
    killers.push(() => tween.kill());
  }
  return () => {
    for (const kill of killers) kill();
  };
}

function runScrollScrub(
  engine: MotionEngine,
  scope: HTMLElement,
  plan: ScrollScrubPlan,
): () => void {
  const { gsap, ScrollTrigger } = engine;
  const ctx = gsap.context(() => {
    gsap.fromTo(
      scope,
      { y: plan.travelPx },
      {
        y: -plan.travelPx,
        ease: plan.ease,
        scrollTrigger: {
          trigger: scope,
          start: plan.start,
          end: plan.end,
          scrub: true,
        },
      },
    );
    ScrollTrigger.refresh();
  }, scope);
  return () => ctx.revert();
}

/**
 * Attaches the JS executor for `effect` to the returned ref. CSS effects and
 * settled modes need no work — the hook only observes and loads the engine
 * for `js` mode at `full` intent, after the node enters the viewport. The
 * concurrent-tween budget applies: when the page is saturated the node keeps
 * its settled state instead of queueing.
 */
export function useMotionFx(effect: MotionEffect, enabled: boolean) {
  const intent = useMotionIntent();
  const mode = resolveFxMode(intent, effect);
  const { ref, shown } = useReveal(enabled && mode === "js");
  const id = useMotionId("fx");

  useEffect(() => {
    if (!enabled || mode !== "js" || !shown) return;
    const scope = ref.current as HTMLElement | null;
    if (!scope || typeof window === "undefined") return;
    if (!withMotionBudget(id)) return;
    const plan =
      effect === "count-up"
        ? countUpPlan(intent, effect)
        : scrollScrubPlan(intent, effect);
    if (!plan) {
      releaseMotionBudget(id);
      return;
    }
    const setup = (engine: MotionEngine) => {
      const cleanup =
        effect === "count-up"
          ? runCountUp(engine, scope, plan as CountUpPlan)
          : runScrollScrub(engine, scope, plan as ScrollScrubPlan);
      if (effect === "count-up") releaseMotionBudget(id);
      return cleanup;
    };
    const handle = withEngine(setup);
    return () => {
      handle.dispose();
      releaseMotionBudget(id);
    };
  }, [enabled, mode, shown, effect, intent, id, ref]);

  return { ref, shown, mode };
}
