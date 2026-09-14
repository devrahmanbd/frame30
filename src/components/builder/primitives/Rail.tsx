/**
 * Phase 2.2 — the one snap-scroll rail.
 *
 * Used by `product_rail`, `deal_strip` and `brand_rail`. Keyboard arrows move
 * the viewport, controls are 44px targets, items are fluid (no fixed pixel
 * widths) so 320px never overflows, and momentum scrolling stays native.
 */
import { useCallback, useRef } from "react";

export function Rail({
  label,
  children,
  itemClassName = "min-w-[45%] sm:min-w-[30%] lg:min-w-[22%]",
}: {
  label: string;
  children: React.ReactNode[];
  itemClassName?: string;
}) {
  const ref = useRef<HTMLUListElement>(null);

  const nudge = useCallback((direction: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: direction * Math.max(160, el.clientWidth * 0.8), behavior: "smooth" });
  }, []);

  if (children.length === 0) return null;

  return (
    <div className="relative">
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
          }
        }}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {children.map((child, index) => (
          <li key={index} className={`shrink-0 snap-start ${itemClassName}`}>
            {child}
          </li>
        ))}
      </ul>
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => nudge(-1)}
          aria-label="Scroll left"
          className="h-11 w-11 rounded-fq-md border border-border bg-card text-sm"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() => nudge(1)}
          aria-label="Scroll right"
          className="h-11 w-11 rounded-fq-md border border-border bg-card text-sm"
        >
          ›
        </button>
      </div>
    </div>
  );
}
