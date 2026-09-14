/**
 * Phase 1.4 — the `reveal` directive.
 *
 * Style-layer reveals must not animate off-screen content (wasted work) and
 * must respect `prefers-reduced-motion`. One shared IntersectionObserver
 * serves every node on the page instead of one observer per section.
 */
import { useEffect, useRef, useState } from "react";

type Entry = (visible: boolean) => void;

let observer: IntersectionObserver | null = null;
const targets = new WeakMap<Element, Entry>();

function ensureObserver() {
  if (observer || typeof IntersectionObserver === "undefined") return observer;
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        targets.get(entry.target)?.(true);
        observer?.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -10% 0px", threshold: 0.05 },
  );
  return observer;
}

/**
 * Returns a ref for the node and whether it has entered the viewport. When
 * reveals are disabled or motion is reduced, it reports visible immediately so
 * the content is never hidden behind a broken animation.
 */
export function useReveal(enabled: boolean) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(!enabled);

  useEffect(() => {
    if (!enabled) {
      setShown(true);
      return;
    }
    const node = ref.current;
    if (!node) return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const io = reduced ? null : ensureObserver();
    if (!io) {
      setShown(true);
      return;
    }
    targets.set(node, setShown);
    io.observe(node);
    return () => {
      targets.delete(node);
      io.unobserve(node);
    };
  }, [enabled]);

  return { ref, shown };
}

/**
 * Phase 3.2 — true after hydration. Visitor-dependent visibility rules (auth,
 * cart, segment) defer until this flips, so SSR and the client agree.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
