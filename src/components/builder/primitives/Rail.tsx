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
 */
import { useCallback, useEffect, useRef, useState } from "react";

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
      onMouseEnter={() => { hovered.current = true; }}
      onMouseLeave={() => { hovered.current = false; }}
    >
      {heading !== undefined && (
        <div className="mb-8 sm:mb-10 text-center">
          {heading}
        </div>
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
            ref.current?.scrollTo({ left: 0, behavior: reduced ? "auto" : "smooth" });
          } else if (event.key === "End") {
            event.preventDefault();
            ref.current?.scrollTo({ left: ref.current.scrollWidth, behavior: reduced ? "auto" : "smooth" });
          }
        }}
        onScroll={updateEdges}
        style={{ WebkitOverflowScrolling: "touch" }}
        className="flex snap-x snap-mandatory gap-6 sm:gap-8 overflow-x-auto scroll-px-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
      >
        {children.map((child, i) => (
          <li
            key={i}
            className={`shrink-0 snap-start ${itemClassName}`}
          >
            {child}
          </li>
        ))}
      </ul>

      {/* Subtle fade edges — visual cue that there's more to scroll, no buttons */}
      {canLeft && (
        <div
          className="pointer-events-none absolute left-0 top-0 h-full w-16 bg-gradient-to-r from-background/80 to-transparent"
          aria-hidden="true"
        />
      )}
      {canRight && (
        <div
          className="pointer-events-none absolute right-0 top-0 h-full w-16 bg-gradient-to-l from-background/80 to-transparent"
          aria-hidden="true"
        />
      )}
    </div>
  );
}
