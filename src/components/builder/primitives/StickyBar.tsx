/**
 * Phase 2.3 — scroll-docked bar.
 *
 * Used by `sticky_buy_bar`. Docks once the sentinel above it leaves the
 * viewport, which is how the condensed bar stays hidden while the real buy
 * box is on screen. No animation under `prefers-reduced-motion`.
 */
import { useEffect, useRef, useState } from "react";

export function useDockedAfterScroll(threshold = 320): boolean {
  const [docked, setDocked] = useState(false);
  const raf = useRef(0);
  useEffect(() => {
    const onScroll = () => {
      if (raf.current) return;
      raf.current = requestAnimationFrame(() => {
        raf.current = 0;
        setDocked(window.scrollY > threshold);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [threshold]);
  return docked;
}

export function StickyBar({
  children,
  visible,
  position = "bottom",
  label,
}: {
  children: React.ReactNode;
  visible: boolean;
  position?: "top" | "bottom";
  label?: string;
}) {
  return (
    <div
      aria-label={label}
      aria-hidden={!visible}
      className={`fixed inset-x-0 z-40 border-border bg-card/95 px-4 py-2 backdrop-blur ${position === "bottom" ? "fq-safe-bottom" : "fq-safe-top"} motion-safe:transition-transform ${
        position === "top" ? "top-0 border-b" : "bottom-0 border-t"
      } ${visible ? "translate-y-0" : position === "top" ? "-translate-y-full" : "translate-y-full"}`}
      style={visible ? undefined : { pointerEvents: "none" }}
    >
      <div className="mx-auto flex max-w-[var(--theme-container,1200px)] items-center justify-between gap-3">
        {children}
      </div>
    </div>
  );
}
