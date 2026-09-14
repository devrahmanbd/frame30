import { useEffect, useRef, useState, type ReactNode } from "react";

import type { HydrationMode } from "@/lib/widget-hydration";

/**
 * Phase 8 — island hydration.
 *
 * The server always renders the widget's real markup, so the page is complete
 * without JS. On the client the island decides whether to *adopt* that markup
 * (mount the component) or leave it alone:
 *
 *  - `static`      never mounts — the widget costs zero client JS;
 *  - `eager`       mounts with the page (chrome, buy path);
 *  - `visible`     mounts when it scrolls into view;
 *  - `interaction` mounts on the first pointer/focus/touch.
 *
 * While dormant we render the same wrapper element with an empty
 * `dangerouslySetInnerHTML`, which tells React to keep the server DOM exactly
 * as it is instead of clearing it.
 */
type Props = {
  mode: HydrationMode;
  type: string;
  children: ReactNode;
};

/** Flips after the first island effect runs, i.e. once hydration has happened. */
let pageHydrated = false;

export function WidgetIsland({ mode, type, children }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  // Islands created after hydration (client navigation, editor inserts) have no
  // server markup to preserve, so they mount immediately.
  const [awake, setAwake] = useState(() => mode === "eager" || pageHydrated);

  useEffect(() => {
    pageHydrated = true;
    if (awake) return;
    const node = ref.current;
    if (!node) return;
    const wake = () => setAwake(true);
    // No server markup underneath (client navigation, editor insert, unit test):
    // there is nothing to preserve, so mount right away.
    if (node.childNodes.length === 0) {
      wake();
      return;
    }
    if (mode === "static") return;

    if (mode === "visible") {
      if (typeof IntersectionObserver === "undefined") {
        wake();
        return;
      }
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            io.disconnect();
            wake();
          }
        },
        { rootMargin: "200px" },
      );
      io.observe(node);
      return () => io.disconnect();
    }

    const events = ["pointerenter", "pointerdown", "focusin", "touchstart", "keydown"] as const;
    for (const event of events) node.addEventListener(event, wake, { once: true, passive: true });
    return () => {
      for (const event of events) node.removeEventListener(event, wake);
    };
  }, [awake, mode]);

  if (awake) {
    return (
      <div ref={ref} data-island={type} data-hydrated="true">
        {children}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      data-island={type}
      data-hydrate={mode}
      suppressHydrationWarning
      {...(typeof document === "undefined" ? {} : { dangerouslySetInnerHTML: { __html: "" } })}
    >
      {typeof document === "undefined" ? children : null}
    </div>
  );
}
