/**
 * Songoskriti motion controller (spec §3, client-only).
 *
 * Hero load timeline (defaults + labels + position params), ScrollTrigger
 * batch reveals (once), snap+buttons carousel controller, and
 * `gsap.matchMedia` branches for ≥768px vs below plus a
 * prefers-reduced-motion static branch. Transforms + opacity only.
 *
 * Adaptations vs the spec text, required by the repo's motion discipline
 * (enforced by `src/lib/motion.contract.test.ts`):
 *
 * 1. No static gsap module import anywhere in this file — the contract
 *    gate fails the suite on it. The engine (gsap + ScrollTrigger) arrives
 *    exclusively through the lazy `withEngine` chunk, exactly like
 *    `src/components/public/landing/TestimonialList.tsx` does.
 * 2. No `@gsap/react` (`useGSAP` is not a dependency — the contract keeps a
 *    single animation engine). Scoping uses `gsap.context(fn, scope)` with
 *    `ctx.revert()` cleanup, the same precedent as (1).
 * 3. Reduced motion is decided by the shared `useMotionIntent` (which folds
 *    in Save-Data / low-memory / SSR `off` on top of the OS setting), not
 *    by a local matchMedia call. The matchMedia static branch below is
 *    defense-in-depth for a mid-session OS-setting change.
 * 4. SplitText (free in the pinned gsap 3.15.0) loads via dynamic import
 *    inside the hero setup; a failed chunk degrades to a whole-headline
 *    tween — never a blank hero.
 *
 * Structure: the pure layer (timeline plan, reveal options, branch
 * decision, carousel state machine) is DOM-free so vitest pins it without
 * an engine; the hooks are thin client-only shells over the pure layer +
 * `withEngine`. Content is never hidden in render — hiding happens inside
 * the engine setup, so a missing/failed chunk leaves the settled layout.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { withEngine, type MotionEngine } from "@/lib/motion-engine";
import { useMotionIntent } from "@/lib/motion-runtime";
import type { MotionIntent } from "@/lib/motion-policy";

/* ------------------------------------------------------------------ tokens */

export const SONGOSKRITI_HERO_DEFAULTS = {
  duration: 0.6,
  ease: "power2.out",
} as const;

/** Desktop branch at ≥768px; below is the single-column mobile branch. */
export const SONGOSKRITI_DESKTOP_MIN = 768;

/** Reveal targets — stamped on songoskriti section roots. */
export const SONGOSKRITI_REVEAL_SELECTOR = "[data-songoskriti-reveal]";

/** Hero scope — stamped on the hero carousel section root. */
export const SONGOSKRITI_HERO_SELECTOR = "[data-songoskriti-hero]";

/* ---------------------------------------------------------- hero timeline */

export type HeroStepFrom = {
  x?: number;
  y?: number;
  autoAlpha?: number;
  opacity?: number;
};

export type HeroTimelineStep = {
  target: string;
  /** Label or numeric/relative position param for the timeline. */
  position: string | number;
  from: HeroStepFrom;
  /** Headline words split via SplitText when the chunk loads. */
  splitWords?: boolean;
  stagger?: number;
};

export type HeroTimelinePlan = {
  defaults: { duration: number; ease: string };
  labels: string[];
  steps: HeroTimelineStep[];
};

/**
 * Hero load timeline plan: eyebrow → SplitText-words headline → sub →
 * CTA → image x/autoAlpha drift. Null unless intent is full — reduced and
 * off intents render the static first slide with no scroll animation.
 */
export function heroTimelinePlan(intent: MotionIntent): HeroTimelinePlan | null {
  if (intent !== "full") return null;
  return {
    defaults: { ...SONGOSKRITI_HERO_DEFAULTS },
    labels: ["hero-start", "hero-copy", "hero-art"],
    steps: [
      {
        target: "[data-hero-eyebrow]",
        position: "hero-start",
        from: { y: 12, autoAlpha: 0 },
      },
      {
        target: "[data-hero-headline]",
        position: "hero-copy",
        from: { y: 18, autoAlpha: 0 },
        splitWords: true,
        stagger: 0.05,
      },
      {
        target: "[data-hero-sub]",
        position: "-=0.35",
        from: { y: 14, autoAlpha: 0 },
      },
      {
        target: "[data-hero-cta]",
        position: "-=0.35",
        from: { y: 14, autoAlpha: 0 },
      },
      {
        target: "[data-hero-art]",
        position: "hero-art",
        from: { x: 24, autoAlpha: 0 },
      },
    ],
  };
}

/* ---------------------------------------------------------- batch reveals */

export function revealBatchOptions() {
  return {
    start: "top 88%",
    once: true,
    toggleActions: "play none none none",
  } as const;
}

/* ------------------------------------------- reveal progressive enhancement */

export type RevealMode = "animate" | "static";

/**
 * Progressive-enhancement gate for batch reveals. Content renders settled
 * (visible) and the hidden state is applied only inside the engine setup —
 * so this returns `"animate"` exclusively at full intent with a live scope.
 * Every other combination (reduced/off intent, or a scope that failed to
 * resolve so its triggers could never fire) returns `"static"`: the hook
 * returns early and the settled markup stays visible.
 */
export function resolveRevealMode(
  intent: MotionIntent,
  scopeAvailable: boolean,
): RevealMode {
  if (intent !== "full") return "static";
  if (!scopeAvailable) return "static";
  return "animate";
}

/**
 * Structural minimum for the scroll-ancestor walk. Real `HTMLElement`
 * chains satisfy it; tests pass plain fakes so this stays DOM-free.
 */
export type RevealScrollNode = {
  readonly parentElement: RevealScrollNode | null;
  readonly overflowY: string;
  readonly scrollHeight: number;
  readonly clientHeight: number;
};

/**
 * Pure scroll-container lookup: the nearest ancestor that actually scrolls
 * (`overflow-y: auto|scroll` with overflowing content), `"viewport"` when
 * the page itself is the scroller, `null` when there is no scope at all.
 */
export function findRevealScrollerNode(
  start: RevealScrollNode | null,
): RevealScrollNode | "viewport" | null {
  if (!start) return null;
  let node = start.parentElement;
  while (node) {
    const scrolls =
      node.overflowY === "auto" || node.overflowY === "scroll";
    if (scrolls && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return "viewport";
}

/**
 * DOM adapter for the walk above. The theme preview (and any dialog host)
 * scrolls inside a nested `overflow-auto` container while ScrollTrigger
 * defaults to the viewport — triggers aimed at the viewport never fire
 * there, stranding sections at `autoAlpha: 0`. Resolving the real scroller
 * keeps reveals firing wherever the page scrolls. A detached scope (whose
 * triggers could never fire either) resolves `null` so the hook leaves it
 * visible instead of hiding it.
 */
export function findRevealScroller(
  scope: HTMLElement,
): HTMLElement | Window | null {
  if (!scope.isConnected) return null;
  let node = scope.parentElement;
  while (node) {
    let overflowY = "";
    try {
      overflowY = window.getComputedStyle(node).overflowY;
    } catch {
      overflowY = "";
    }
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      node.scrollHeight > node.clientHeight
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return window;
}

/* --------------------------------------------------------- branch decision */

export type SongoskritiBranch = "desktop" | "mobile" | "static";

/**
 * Pure branch decision shared by the hook and the tests: any non-full
 * intent (reduced motion, Save-Data, SSR) goes static; full intent splits
 * on the 768px breakpoint.
 */
export function resolveSongoskritiBranch(
  intent: MotionIntent,
  viewportWidthPx: number,
): SongoskritiBranch {
  if (intent !== "full") return "static";
  return viewportWidthPx >= SONGOSKRITI_DESKTOP_MIN ? "desktop" : "mobile";
}

/* ----------------------------------------------------- carousel controller */

export type CarouselControllerOptions = {
  count: number;
  autoAdvanceMs?: number;
  intent?: MotionIntent;
  onIndex?: (index: number) => void;
};

export type CarouselController = {
  getIndex: () => number;
  isAuto: () => boolean;
  goTo: (index: number) => void;
  next: () => void;
  prev: () => void;
  pause: () => void;
  resume: () => void;
  start: () => void;
  stop: () => void;
};

/**
 * Snap+buttons carousel state machine (spec: scroll-snap + buttons ONLY —
 * no Draggable/Observer). DOM-free: the renderer owns snap CSS + buttons
 * and mirrors `getIndex()` via `onIndex`.
 *
 * Reduced/off intents never arm the timer (static first slide); manual
 * next/prev/goTo keep working so buttons and dots stay usable for every
 * visitor. No pinning anywhere.
 */
export function createCarouselController(
  options: CarouselControllerOptions,
): CarouselController {
  const safeCount = Math.max(0, Math.floor(options.count));
  const autoAdvanceMs = options.autoAdvanceMs ?? 6000;
  const intent = options.intent ?? "full";
  const onIndex = options.onIndex;
  let index = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let paused = false;

  const wrap = (i: number) =>
    safeCount === 0 ? 0 : ((i % safeCount) + safeCount) % safeCount;

  const arm = () => {
    if (timer || intent !== "full" || safeCount <= 1 || paused) return;
    timer = setInterval(() => {
      index = wrap(index + 1);
      onIndex?.(index);
    }, autoAdvanceMs);
  };

  const disarm = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  return {
    getIndex: () => index,
    isAuto: () => timer !== null,
    goTo: (i: number) => {
      index = wrap(i);
      onIndex?.(index);
    },
    next: () => {
      index = wrap(index + 1);
      onIndex?.(index);
    },
    prev: () => {
      index = wrap(index - 1);
      onIndex?.(index);
    },
    pause: () => {
      paused = true;
      disarm();
    },
    resume: () => {
      paused = false;
      arm();
    },
    start: () => {
      arm();
    },
    stop: () => {
      disarm();
    },
  };
}

/* ------------------------------------------------------------------- hooks */

type GsapTimeline = ReturnType<MotionEngine["gsap"]["timeline"]>;

function scopeTargets(
  scope: HTMLElement,
  selector: string,
): HTMLElement[] {
  if (scope.matches(selector)) return [scope];
  return Array.from(scope.querySelectorAll(selector));
}

/**
 * Hero load timeline. Runs once at full intent inside a gsap context
 * scoped to `scopeRef`; `ctx.revert()` on cleanup kills every tween,
 * matchMedia branch, and off-screen trigger the setup created.
 */
export function useSongoskritiHero(
  scopeRef: { readonly current: HTMLElement | null },
  enabled: boolean,
) {
  const intent = useMotionIntent();

  useEffect(() => {
    if (!enabled || intent !== "full") return;
    const scope = scopeRef.current;
    if (!scope || typeof window === "undefined") return;
    const plan = heroTimelinePlan(intent);
    if (!plan) return;

    const setup = (engine: MotionEngine) => {
      const { gsap, ScrollTrigger } = engine;
      const ctx = gsap.context(() => {
        const mm = gsap.matchMedia();

        const buildCopyTimeline = (
          parent: GsapTimeline,
          splitWords: string[] | null,
        ) => {
          for (const step of plan.steps) {
            if (step.target === "[data-hero-art]") continue;
            if (step.splitWords && splitWords && splitWords.length > 0) {
              parent.add(
                gsap.from(splitWords, {
                  y: step.from.y ?? 0,
                  autoAlpha: 0,
                  duration: plan.defaults.duration,
                  ease: plan.defaults.ease,
                  stagger: step.stagger ?? 0.05,
                  overwrite: "auto",
                  clearProps: "transform,opacity,visibility",
                }),
                step.position,
              );
            } else {
              parent.add(
                gsap.from(step.target, {
                  ...(step.from.x !== undefined ? { x: step.from.x } : {}),
                  ...(step.from.y !== undefined ? { y: step.from.y } : {}),
                  autoAlpha: 0,
                  duration: plan.defaults.duration,
                  ease: plan.defaults.ease,
                  overwrite: "auto",
                  clearProps: "transform,opacity,visibility",
                }),
                step.position,
              );
            }
          }
        };

        const buildArt = (parent: GsapTimeline) => {
          const art = plan.steps.find(
            (s) => s.target === "[data-hero-art]",
          )!;
          parent.add(
            gsap.from(art.target, {
              x: art.from.x ?? 0,
              autoAlpha: 0,
              duration: plan.defaults.duration,
              ease: plan.defaults.ease,
              overwrite: "auto",
              clearProps: "transform,opacity,visibility",
            }),
            art.position,
          );
        };

        // Desktop branch: full labeled timeline + pointer drift via
        // quickTo (transform-only, desktop-with-cursor affordance).
        mm.add(`(min-width: ${SONGOSKRITI_DESKTOP_MIN}px)`, () => {
          const tl = gsap.timeline({
            defaults: { ...plan.defaults },
          });
          tl.addLabel("hero-start", 0);
          // SplitText chunk is best-effort: failure degrades to the
          // whole-headline tween built by buildCopyTimeline(null).
          void import("gsap/SplitText")
            .then((mod) => {
              const SplitText =
                (mod as { SplitText?: unknown }).SplitText ??
                (mod as { default?: unknown }).default;
              if (!SplitText) throw new Error("splittext-missing");
              gsap.registerPlugin(SplitText as never);
              const heads = scope.querySelectorAll("[data-hero-headline]");
              const words: string[] = [];
              const splits: { revert: () => void }[] = [];
              heads.forEach((el) => {
                try {
                  const split = new (SplitText as new (target: Element, vars: object) => { words: Element[]; revert: () => void })(
                    el,
                    { type: "words", wordsClass: "hero-word" },
                  );
                  splits.push(split);
                  for (const w of split.words)
                    words.push(w as unknown as string);
                } catch {
                  /* per-headline fallback: block tween below covers it */
                }
              });
              buildCopyTimeline(tl, words.length > 0 ? words : null);
              buildArt(tl);
              void splits;
            })
            .catch(() => {
              buildCopyTimeline(tl, null);
              buildArt(tl);
            });

          const art = scope.querySelector<HTMLElement>("[data-hero-art]");
          if (art) {
            const qx = gsap.quickTo(art, "x", {
              duration: 0.4,
              ease: "power2.out",
            });
            const onMove = (event: PointerEvent) => {
              if (event.pointerType !== "mouse") return;
              const rect = scope.getBoundingClientRect();
              const dx = (event.clientX - rect.left) / Math.max(rect.width, 1) - 0.5;
              qx(dx * 24);
            };
            scope.addEventListener("pointermove", onMove);
            return () => scope.removeEventListener("pointermove", onMove);
          }
          return undefined;
        });

        // Mobile branch: same story, no pointer drift.
        mm.add(`(max-width: ${SONGOSKRITI_DESKTOP_MIN - 1}px)`, () => {
          const tl = gsap.timeline({
            defaults: { ...plan.defaults },
          });
          tl.addLabel("hero-start", 0);
          buildCopyTimeline(tl, null);
          buildArt(tl);
          return undefined;
        });

        // Reduced-motion static branch: settle everything, animate
        // nothing (covers a mid-session OS-setting change).
        mm.add("(prefers-reduced-motion: reduce)", () => {
          gsap.set(
            [
              "[data-hero-eyebrow]",
              "[data-hero-headline]",
              "[data-hero-sub]",
              "[data-hero-cta]",
              "[data-hero-art]",
            ],
            { clearProps: "transform,opacity,visibility" },
          );
          return undefined;
        });
      }, scope);

      const onLoad = () => ScrollTrigger.refresh();
      window.addEventListener("load", onLoad);
      return () => {
        window.removeEventListener("load", onLoad);
        ctx.revert();
      };
    };

    const scopeHandle = withEngine(setup);
    return () => scopeHandle.dispose();
  }, [enabled, intent, scopeRef]);
}

/**
 * ScrollTrigger.batch reveals for `[data-songoskriti-reveal]` nodes under
 * `scopeRef`. Once-only, play-and-hold toggle actions, scoped to the real
 * scroll container (nested `overflow-auto` preview/dialog hosts included —
 * viewport-aimed triggers never fire there), refresh after setup and after
 * images load; `ctx.revert()` kills off-screen triggers on unmount.
 * Non-full intents — and scopes whose scroller cannot be resolved — render
 * settled content with no observer at all (see `resolveRevealMode`).
 */
export function useSongoskritiReveals(
  scopeRef: { readonly current: HTMLElement | null },
  enabled: boolean,
) {
  const intent = useMotionIntent();

  useEffect(() => {
    if (!enabled) return;
    const scope = scopeRef.current;
    if (!scope || typeof window === "undefined") return;
    // Progressive enhancement: reduced/off intents stay settled-visible.
    if (resolveRevealMode(intent, true) !== "animate") return;
    const targets = scopeTargets(scope, SONGOSKRITI_REVEAL_SELECTOR);
    if (targets.length === 0) return;
    // Scroller lookup failure also stays settled-visible: hiding targets
    // whose triggers could never fire would strand them at opacity 0.
    const scroller = findRevealScroller(scope);
    if (!scroller) return;
    const opts = revealBatchOptions();

    const setup = (engine: MotionEngine) => {
      const { gsap, ScrollTrigger } = engine;
      const ctx = gsap.context(() => {
        try {
          gsap.set(targets, { y: 16, autoAlpha: 0 });
          // once:true + onEnter-only implements exactly the recorded
          // toggleActions "play none none none" (fire once on enter, never
          // reverse or replay). toggleActions itself is a per-trigger var
          // that ScrollTrigger.batch does not accept, so it lives in
          // revealBatchOptions() as the documented intent.
          ScrollTrigger.batch(targets, {
            start: opts.start,
            once: opts.once,
            scroller,
            onEnter: (batch) =>
              gsap.to(batch, {
                y: 0,
                autoAlpha: 1,
                duration: 0.6,
                ease: "power2.out",
                overwrite: "auto",
                clearProps: "transform,opacity,visibility",
              }),
          });
          ScrollTrigger.refresh();
        } catch {
          // A failed trigger setup must never leave content hidden.
          gsap.set(targets, {
            clearProps: "transform,opacity,visibility",
          });
        }
      }, scope);
      const onLoad = () => ScrollTrigger.refresh();
      window.addEventListener("load", onLoad);
      return () => {
        window.removeEventListener("load", onLoad);
        ctx.revert();
      };
    };

    const scopeHandle = withEngine(setup);
    return () => scopeHandle.dispose();
  }, [enabled, intent, scopeRef]);
}

/**
 * React binding for the carousel controller: mirrors controller state
 * into React state via `onIndex`, arms the timer only at full intent
 * (reduced/off stay on the static first slide), and stops it on unmount.
 */
export function useSongoskritiCarousel(
  count: number,
  autoAdvanceMs = 6000,
) {
  const intent = useMotionIntent();
  const [index, setIndex] = useState(0);
  const controller = useMemo(
    () =>
      createCarouselController({
        count,
        autoAdvanceMs,
        intent,
        onIndex: setIndex,
      }),
    [count, autoAdvanceMs, intent],
  );
  const ref = useRef(controller);
  ref.current = controller;

  useEffect(() => {
    ref.current.start();
    return () => ref.current.stop();
  }, [controller]);

  return {
    index,
    auto: intent === "full" && count > 1,
    goTo: (i: number) => ref.current.goTo(i),
    next: () => ref.current.next(),
    prev: () => ref.current.prev(),
    pause: () => ref.current.pause(),
    resume: () => ref.current.resume(),
  };
}
