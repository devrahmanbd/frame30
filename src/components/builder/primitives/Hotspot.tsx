/**
 * Phase 2.6 — hotspot pin used by `shoppable_image`.
 *
 * A pin is a real button positioned in percentage space over the image, so it
 * survives any container width. Its popover is rendered inline (not portalled)
 * and is reachable by keyboard: focus the pin, press Enter or Space, press
 * Escape to dismiss. Coordinates are clamped so a bad prop can never push a pin
 * off the frame.
 */
import { useEffect, useRef, useState } from "react";

/** Keeps a pin inside the frame with room for its own hit target. */
export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.min(96, Math.max(4, Math.round(value)));
}

export function Hotspot({
  x,
  y,
  label,
  index,
  children,
}: {
  x: number;
  y: number;
  label: string;
  index: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={wrap}
      className="absolute"
      style={{ left: `${clampPercent(x)}%`, top: `${clampPercent(y)}%`, transform: "translate(-50%, -50%)" }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card/90 text-sm font-semibold shadow-fq-sm backdrop-blur"
      >
        <span aria-hidden="true">{index}</span>
      </button>
      {open && (
        <div className="absolute left-1/2 top-[calc(100%+8px)] z-10 w-56 -translate-x-1/2 rounded-fq-md border border-border bg-card p-2 shadow-fq-md">
          {children}
        </div>
      )}
    </div>
  );
}
