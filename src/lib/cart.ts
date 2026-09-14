import { useCallback, useEffect, useState } from "react";
import { trackEvent } from "./traffic-client";

export type CartLine = { variantId: string; quantity: number };

const key = (slug: string) => `framique.cart.${slug}`;

function read(slug: string): CartLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key(slug));
    const parsed = raw ? (JSON.parse(raw) as CartLine[]) : [];
    return Array.isArray(parsed) ? parsed.filter((l) => l?.variantId && l.quantity > 0) : [];
  } catch {
    return [];
  }
}

export function useCart(slug: string) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setLines(read(slug));
    setHydrated(true);
  }, [slug]);

  const persist = useCallback(
    (next: CartLine[]) => {
      setLines(next);
      window.localStorage.setItem(key(slug), JSON.stringify(next));
      window.dispatchEvent(new Event("framique:cart"));
    },
    [slug],
  );

  useEffect(() => {
    const sync = () => setLines(read(slug));
    window.addEventListener("framique:cart", sync);
    return () => window.removeEventListener("framique:cart", sync);
  }, [slug]);

  const add = useCallback(
    (variantId: string, quantity = 1) => {
      const current = read(slug);
      const existing = current.find((l) => l.variantId === variantId);
      const next = existing
        ? current.map((l) => (l.variantId === variantId ? { ...l, quantity: l.quantity + quantity } : l))
        : [...current, { variantId, quantity }];
      persist(next);
      // Funnel step: the cart stage of every merchant's report comes from here.
      trackEvent({ entity: "cart", action: "add", payload: { variantId, quantity } });
    },
    [persist, slug],
  );

  const setQuantity = useCallback(
    (variantId: string, quantity: number) => {
      const next = read(slug)
        .map((l) => (l.variantId === variantId ? { ...l, quantity } : l))
        .filter((l) => l.quantity > 0);
      persist(next);
    },
    [persist, slug],
  );

  const clear = useCallback(() => persist([]), [persist]);

  const count = lines.reduce((sum, l) => sum + l.quantity, 0);

  return { lines, count, hydrated, add, setQuantity, clear };
}
