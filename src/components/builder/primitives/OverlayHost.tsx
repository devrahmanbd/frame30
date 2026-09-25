/**
 * Phase 1.3 — one overlay host for the whole theme runtime.
 *
 * Cart drawer, quick view, size guide, facet drawer and mega-menu all mount
 * here, so focus trap, scroll lock, Escape and focus restore are implemented
 * once and cannot drift apart. Rendered inline (no portal) so it works during
 * SSR; the dialog is only mounted while open.
 */
import { useCallback, useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function OverlayHost({
  open,
  onClose,
  title,
  side = "center",
  closeLabel = "Close",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  side?: "center" | "right" | "bottom";
  /** Screen-reader label for the dismiss button; callers pass the locale. */
  closeLabel?: string;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  const focusFirst = useCallback(() => {
    const nodes = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
    (nodes?.[0] ?? panelRef.current)?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = (document.activeElement as HTMLElement | null) ?? null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    focusFirst();
    return () => {
      document.body.style.overflow = overflow;
      restoreRef.current?.focus?.();
    };
  }, [open, focusFirst]);

  if (!open) return null;

  const position =
    side === "right"
      ? "ml-auto h-full w-full max-w-md"
      : side === "bottom"
        ? "mt-auto w-full max-h-[85vh]"
        : "m-auto w-full max-w-lg";

  /**
   * Cart-lane slide language, transform-only and gated behind `motion-safe`
   * so `prefers-reduced-motion` collapses to an instant appearance. No
   * `fade-*` is set on purpose: the enter animation touches translate alone.
   * Behaviour (focus trap, Escape, scroll lock, focus restore) is untouched.
   */
  const enter =
    side === "right"
      ? "motion-safe:slide-in-from-right"
      : side === "bottom"
        ? "motion-safe:slide-in-from-bottom"
        : "motion-safe:slide-in-from-bottom-2";

  return (
    <div
      className="fixed inset-0 z-50 flex bg-foreground/40 p-0 sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
            return;
          }
          if (event.key !== "Tab") return;
          const nodes = [
            ...(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ??
              []),
          ];
          if (nodes.length === 0) return;
          const first = nodes[0]!;
          const last = nodes[nodes.length - 1]!;
          const active = document.activeElement;
          if (event.shiftKey && active === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && active === last) {
            event.preventDefault();
            first.focus();
          }
        }}
        className={`${position} overflow-auto rounded-none border border-border bg-card p-4 shadow-md sm:rounded-fq-lg motion-safe:animate-in motion-safe:duration-200 motion-safe:ease-out ${enter}`}
      >
        <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <h2 className="truncate font-bangla-display text-base font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-fq-md border border-border text-lg leading-none"
          >
            <span aria-hidden="true">×</span>
            <span className="sr-only">{closeLabel}</span>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
