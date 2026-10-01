/**
 * Nakhrali-grade snap-scroll product rail (redesign 2026-09-26).
 *
 * Visual model: nakhrali.com — no prev/next buttons, no visible scrollbar,
 * native CSS scroll-snap on touch and desktop, keyboard arrow support,
 * auto-scroll every 4s on desktop (paused on hover / reduced-motion / touch).
 *
 * Contract preserved:
 * - Same props as the old Rail — heading slot, label, children, itemClassName.
 * - Scrollbar hidden via scrollbar-width:none + webkit-scrollbar:hidden (was already done).
 * - Keyboard: ArrowLeft/Right/Home/End still work for a11y.
 *
 * Scroll motion (2026-10-01): cards glide in on a staggered ScrollTrigger
 * batch as the rail enters view, and card images ease out of a 1.08 zoom
 * across the rail's travel (clipped by the card's overflow frame). Motion
 * discipline follows the shared rules — no static gsap import (lazy
 * `withEngine` only), intent-gated via `useMotionIntent`, content hidden
 * only inside the engine setup so a failed chunk degrades to a settled
 * rail, and the scroller resolved so the theme preview's nested scroll
 * container fires triggers too. Horizontal-only entrance transform: the
 * ul is an overflow-x scroll container, so vertical offsets would create
 * a phantom scroll area.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { withEngine, type MotionEngine } from "@/lib/motion-engine";
import { useMotionIntent } from "@/lib/motion-runtime";
import {
  findRevealScroller,
  revealBatchOptions,
  resolveRevealMode,
} from "@/components/builder/songoskriti-motion";

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

export function Rail({
  label,
  children,
  itemClassName = "w-[72vw] max-w-[300px] min-w-[10rem] sm:w-[38vw] sm:max-w-[320px] lg:w-[22%] lg:min-w-0",
  heading,
  prevLabel = "Scroll left",
  nextLabel = "Scroll right",
}: {
  label: string;
  children: React.ReactNode[];
  itemClassName?: string;
  heading?: React.ReactNode;
  prevLabel?: string;
  nextLabel?: string;
}) {
  const ref = useRef<HTMLUListElement>(null);
  const reduced = usePrefersReducedMotion();
  const intent = useMotionIntent();
  const hovered = useRef(false);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(true);
  // Touch detection — disable auto-scroll on touch devices
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsTouch(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  const updateEdges = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (el.scrollWidth === 0) return;
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 4) {
      setCanLeft(false);
      setCanRight(false);
      return;
    }
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft < max - 4);
  }, []);

  useEffect(() => {
    updateEdges();
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", updateEdges, { passive: true });
    window.addEventListener("resize", updateEdges);
    return () => {
      el.removeEventListener("scroll", updateEdges);
      window.removeEventListener("resize", updateEdges);
    };
  }, [updateEdges, children.length]);

  // Auto-scroll every 4s on desktop, paused on hover/reduced-motion/touch
  useEffect(() => {
    if (reduced || isTouch) return;
    const tick = setInterval(() => {
      if (hovered.current) return;
      const el = ref.current;
      if (!el) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 4) return;
      // Wrap around to start when we reach the end
      if (el.scrollLeft >= max - 8) {
        el.scrollTo({ left: 0, behavior: "smooth" });
      } else {
        const itemWidth = el.querySelector("li")?.offsetWidth ?? 300;
        el.scrollBy({ left: itemWidth, behavior: "smooth" });
      }
    }, 4000);
    return () => clearInterval(tick);
  }, [reduced, isTouch]);

  // Scroll motion — entrance batch + scrub image zoom (see header comment).
  useEffect(() => {
    const rail = ref.current;
    if (!rail) return;
    const scroller = findRevealScroller(rail);
    if (resolveRevealMode(intent, scroller !== null) !== "animate") return;
    const opts = revealBatchOptions();

    const setup = (engine: MotionEngine) => {
      const { gsap, ScrollTrigger } = engine;
      const items = gsap.utils.toArray<HTMLElement>("li", rail);
      if (items.length === 0) return;
      const ctx = gsap.context(() => {
        try {
          gsap.set(items, { x: 28, autoAlpha: 0 });
          ScrollTrigger.batch(items, {
            start: opts.start,
            once: opts.once,
            scroller,
            onEnter: (batch) =>
              gsap.to(batch, {
                x: 0,
                autoAlpha: 1,
                duration: 0.6,
                ease: "power2.out",
                overwrite: "auto",
                clearProps: "transform,opacity,visibility",
              }),
          });
          // Scrub zoom on the card images — the card frame clips the
          // scale, so no phantom overflow in the rail's scroll box.
          const images: HTMLElement[] = [];
          for (const item of items) {
            const img = item.querySelector("img");
            if (img instanceof HTMLElement) images.push(img);
          }
          if (images.length > 0) {
            gsap.fromTo(
              images,
              { scale: 1.08 },
              {
                scale: 1,
                ease: "none",
                scrollTrigger: {
                  trigger: rail,
                  scroller,
                  start: "top bottom",
                  end: "bottom top",
                  scrub: true,
                },
              },
            );
          }
          ScrollTrigger.refresh();
        } catch {
          // A failed trigger setup must never leave cards hidden.
          gsap.set(items, { clearProps: "transform,opacity,visibility" });
        }
      }, rail);
      const onLoad = () => ScrollTrigger.refresh();
      window.addEventListener("load", onLoad);
      return () => {
        window.removeEventListener("load", onLoad);
        ctx.revert();
      };
    };

    const handle = withEngine(setup);
    return () => handle.dispose();
  }, [intent, children.length]);

  const nudge = useCallback(
    (direction: 1 | -1) => {
      const el = ref.current;
      if (!el) return;
      el.scrollBy({
        left: direction * Math.max(160, el.clientWidth * 0.8),
        behavior: reduced ? "auto" : "smooth",
      });
    },
    [reduced],
  );

  if (children.length === 0) return null;

  return (
    <div
      className="relative"
      onMouseEnter={() => {
        hovered.current = true;
      }}
      onMouseLeave={() => {
        hovered.current = false;
      }}
    >
      {heading !== undefined && (
        <div className="mb-8 sm:mb-10 text-center">{heading}</div>
      )}
      <ul
        ref={ref}
        aria-label={label}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") {
            event.preventDefault();
            nudge(1);
          } else if (event.key === "ArrowLeft") {
            event.preventDefault();
            nudge(-1);
          } else if (event.key === "Home") {
            event.preventDefault();
            ref.current?.scrollTo({
              left: 0,
              behavior: reduced ? "auto" : "smooth",
            });
          } else if (event.key === "End") {
            event.preventDefault();
            ref.current?.scrollTo({
              left: ref.current.scrollWidth,
              behavior: reduced ? "auto" : "smooth",
            });
          }
        }}
        onScroll={updateEdges}
        style={{ WebkitOverflowScrolling: "touch" }}
        className="flex snap-x snap-mandatory gap-6 sm:gap-8 overflow-x-auto scroll-px-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
      >
        {children.map((child, i) => (
          <li key={i} className={`shrink-0 snap-start ${itemClassName}`}>
            {child}
          </li>
        ))}
      </ul>

      {/* Scroll controls */}
      {canLeft && (
        <button
          type="button"
          data-part="rail-nav"
          aria-label="Scroll left"
          onClick={() => nudge(-1)}
          className="absolute left-2 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm ring-1 ring-foreground/5 backdrop-blur transition-all hover:scale-105 hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-primary z-10"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
      )}
      {canRight && (
        <button
          type="button"
          data-part="rail-nav"
          aria-label="Scroll right"
          onClick={() => nudge(1)}
          className="absolute right-2 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm ring-1 ring-foreground/5 backdrop-blur transition-all hover:scale-105 hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-primary z-10"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      )}
    </div>
  );
}
