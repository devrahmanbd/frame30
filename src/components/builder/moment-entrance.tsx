/**
 * Shared one-shot entrance moment for guided-selling widgets.
 *
 * Hallmark discipline: a single page-load entrance on the shade finder
 * (the homepage's signature interactive section). Everything else on the
 * page is static. The moment runs through the shared lazy engine
 * (`withEngine`, dynamic gsap import only) and the resolved motion intent,
 * so it never fires under `prefers-reduced-motion`, `saveData`, or a
 * merchant `motion: "none"` theme — and it never trips the
 * `motion.contract.test.ts` "no static gsap import" invariant.
 *
 * Theme independence: this module imports no theme, preset or vertical
 * module and hardcodes no colour — the widget-registry contract holds.
 *
 * Hallmark pre-emit critique: P5 H5 E4 S5 R5 V4.
 */
import { useEffect, useRef } from "react";
import { useMotionIntent } from "@/lib/motion-runtime";
import { withEngine } from "@/lib/motion-engine";
import type { MotionIntent } from "@/lib/motion-policy";
import { useReveal } from "./reveal";

/** Selector for the swatch dots the moment orchestrates. Scoped per mount. */
export const MOMENT_SWATCH_TARGETS = "[data-rupaboti-swatch]";

/**
 * Pure config for the moment. Kept outside the hook so vitest can assert the
 * budget (one-shot, transform+opacity only, under the lively duration cap)
 * without touching the DOM or the engine.
 */
export function momentCascadeConfig(intent: MotionIntent) {
  if (intent !== "full") return null;
  return {
    targets: MOMENT_SWATCH_TARGETS,
    /** Stagger the swatches once — a single cascade, never a loop. */
    stagger: 0.06,
    duration: 0.5,
    ease: "power2.out",
    /** Transform + opacity only: GPU-accelerated, no layout work. */
    from: { y: 14, autoAlpha: 0 },
    runOnce: true,
  } as const;
}

/**
 * Attaches the moment to a section root. Returns the ref to spread onto the
 * section element. When the intent is anything but `full`, or the engine
 * chunk fails, the section simply renders settled — no placeholder, no
 * layout shift, content never hidden behind a broken animation.
 */
export function useMomentEntrance(enabled: boolean) {
  const intent = useMotionIntent();
  const { ref, shown } = useReveal(enabled && intent === "full");
  const played = useRef(false);

  useEffect(() => {
    if (!shown || played.current) return;
    const node = ref.current as HTMLElement | null;
    if (!node) return;
    played.current = true;
    const config = momentCascadeConfig(intent);
    if (!config) return;
    const scope = withEngine(({ gsap }) => {
      const dots = node.querySelectorAll(config.targets);
      if (dots.length === 0) return;
      gsap.from(dots, {
        y: config.from.y,
        autoAlpha: 0,
        duration: config.duration,
        ease: config.ease,
        stagger: config.stagger,
        overwrite: "auto",
        clearProps: "transform,opacity,visibility",
      });
    });
    return () => scope.dispose();
  }, [shown, intent, ref]);

  return { ref, shown };
}
