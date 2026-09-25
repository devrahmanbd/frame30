/**
 * Phase 2.2 — the one snap-scroll rail.
 *
 * Used by `product_rail`, `deal_strip` and `brand_rail`. Keyboard arrows move
 * the viewport, controls are 44px targets, items are fluid (no fixed pixel
 * widths) so 320px never overflows, and momentum scrolling stays native.
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
  /**
   * Optional header node (typically the section H2). When provided the
   * prev/next arrows dock into the same header row instead of floating in
   * a separate row beneath the rail; when absent the legacy bottom-row
   * controls render exactly as before.
   */
  heading?: React.ReactNode;
  /** Bilingual arrow labels — merch widgets pass bn/en strings. */
  prevLabel?: string;
  nextLabel?: string;
}) {
  const ref = useRef<HTMLUListElement>(null);
  const reduced = usePrefersReducedMotion();
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(true);

  const updateEdges = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // jsdom / SSR have no layout (scrollWidth 0) — keep the optimistic
    // initial state so controls stay usable in tests and static markup.
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

  const controls = (
    <>
      <button
        type="button"
        onClick={() => nudge(-1)}
        disabled={!canLeft}
        aria-label={prevLabel}
        className="h-11 w-11 rounded-fq-md border border-border bg-card text-sm transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-default disabled:opacity-40"
      >
        ‹
      </button>
      <button
        type="button"
        onClick={() => nudge(1)}
        disabled={!canRight}
        aria-label={nextLabel}
        className="h-11 w-11 rounded-fq-md border border-border bg-card text-sm transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-default disabled:opacity-40"
      >
        ›
      </button>
    </>
  );

  return (
    <div className="relative">
      {heading !== undefined && (
        <div className="mb-3 flex items-end justify-between gap-3">
          <div className="min-w-0 flex-1">{heading}</div>
          <div className="flex shrink-0 gap-2">{controls}</div>
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
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-4 pb-2 motion-safe:scroll-smooth focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {children.map((child, index) => (
          <li key={index} className={`shrink-0 snap-start ${itemClassName}`}>
            {child}
          </li>
        ))}
      </ul>
      {heading === undefined && (
        <div className="mt-2 flex justify-end gap-2">{controls}</div>
      )}
    </div>
  );
}
