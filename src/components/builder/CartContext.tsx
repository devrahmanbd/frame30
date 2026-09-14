/**
 * Phase 2.5 — the shared cart context.
 *
 * Every cart, checkout and summary widget reads this one context. It owns the
 * lines (via the existing `useCart` hook), the *server* quote, the payment
 * method selection and the coupon code, so a page with a line list, a summary
 * and a drawer issues one quote per change instead of three.
 *
 * The hard rule of this phase lives here: totals are whatever the server
 * returned. Nothing downstream of this file does money arithmetic.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useCart, type CartLine } from "@/lib/cart";
import { quoteCart } from "@/lib/storefront.functions";
import type { PaymentMethodKey } from "@/lib/payment-rails";

/** Server-valued totals, mirrored from `pricing.server.ts`. Display only. */
export type CartTotals = {
  currency: string;
  subtotalMinor: number;
  discountMinor: number;
  shippingMinor: number;
  codSurchargeMinor: number;
  vatMinor: number;
  totalMinor: number;
  /** Null when the store has no free-shipping threshold configured. */
  freeShippingThresholdMinor: number | null;
  /** Server-computed remainder to free shipping; 0 once it is earned. */
  freeShippingRemainingMinor: number;
  coupon: { code: string; discountMinor: number } | null;
  lines: {
    variantId: string;
    productTitle: string;
    variantName: string;
    unitPriceMinor: number;
    quantity: number;
    lineTotalMinor: number;
    stock: number;
  }[];
};

export type CartContextValue = {
  lines: CartLine[];
  count: number;
  totals: CartTotals | null;
  /** True while a quote is in flight — widgets render skeletons, not stale math. */
  pending: boolean;
  /** Server-side failure (empty cart, unavailable rail, stock) in plain words. */
  error: string | null;
  /** Rails this store can actually take money through. */
  methods: PaymentMethodKey[];
  method: PaymentMethodKey;
  setMethod: (method: PaymentMethodKey) => void;
  couponCode: string;
  setCouponCode: (code: string) => void;
  setQuantity: (variantId: string, quantity: number) => void;
  remove: (variantId: string) => void;
  clear: () => void;
  /** Absent in the studio canvas, where the cart is a demo snapshot. */
  live: boolean;
};

/**
 * Studio fallback. The canvas has no shopper and no store, so widgets render
 * a representative snapshot instead of an empty box a merchant cannot judge.
 */
export const DEMO_CART: CartContextValue = {
  lines: [
    { variantId: "demo-1", quantity: 1 },
    { variantId: "demo-2", quantity: 2 },
  ],
  count: 3,
  totals: {
    currency: "BDT",
    subtotalMinor: 249000,
    discountMinor: 20000,
    shippingMinor: 6000,
    codSurchargeMinor: 0,
    vatMinor: 0,
    totalMinor: 235000,
    freeShippingThresholdMinor: 300000,
    freeShippingRemainingMinor: 51000,
    coupon: null,
    lines: [
      {
        variantId: "demo-1",
        productTitle: "Sample product",
        variantName: "Default",
        unitPriceMinor: 99000,
        quantity: 1,
        lineTotalMinor: 99000,
        stock: 12,
      },
      {
        variantId: "demo-2",
        productTitle: "Second product",
        variantName: "Medium",
        unitPriceMinor: 75000,
        quantity: 2,
        lineTotalMinor: 150000,
        stock: 5,
      },
    ],
  },
  pending: false,
  error: null,
  methods: ["cod", "bkash", "nagad"],
  method: "cod",
  setMethod: () => {},
  couponCode: "",
  setCouponCode: () => {},
  setQuantity: () => {},
  remove: () => {},
  clear: () => {},
  live: false,
};

const CartCtx = createContext<CartContextValue>(DEMO_CART);

export const CartProvider = CartCtx.Provider;

export function useCartContext(): CartContextValue {
  return useContext(CartCtx);
}

/**
 * Live binding for storefront routes: wraps `useCart` and re-quotes on the
 * server whenever the lines, the method or the coupon change. One quote per
 * change, shared by every widget under the provider.
 */
export function useLiveCart(storeSlug: string): CartContextValue {
  const cart = useCart(storeSlug);
  const [method, setMethod] = useState<PaymentMethodKey>("cod");
  const [couponCode, setCouponCode] = useState("");
  const [totals, setTotals] = useState<CartTotals | null>(null);
  const [methods, setMethods] = useState<PaymentMethodKey[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const signature = JSON.stringify(cart.lines);

  useEffect(() => {
    if (!cart.hydrated) return;
    if (cart.lines.length === 0) {
      setTotals(null);
      setError(null);
      setPending(false);
      return;
    }
    const ticket = ++seq.current;
    setPending(true);
    quoteCart({ data: { slug: storeSlug, cart: cart.lines, paymentMethod: method, couponCode } })
      .then((result) => {
        // Out-of-order responses are dropped: the last request wins, so a fast
        // quantity tap never leaves an older total on screen.
        if (ticket !== seq.current) return;
        setTotals(result.totals as unknown as CartTotals);
        setMethods(result.settings.methods);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (ticket !== seq.current) return;
        setTotals(null);
        setError(cause instanceof Error ? cause.message : "Could not price this cart");
      })
      .finally(() => {
        if (ticket === seq.current) setPending(false);
      });
    // `signature` stands in for the line array identity.
     
  }, [signature, method, couponCode, storeSlug, cart.hydrated]);

  const remove = useCallback((variantId: string) => cart.setQuantity(variantId, 0), [cart]);

  return useMemo(
    () => ({
      lines: cart.lines,
      count: cart.count,
      totals,
      pending,
      error,
      methods,
      method,
      setMethod,
      couponCode,
      setCouponCode,
      setQuantity: cart.setQuantity,
      remove,
      clear: cart.clear,
      live: true,
    }),
    [cart.lines, cart.count, cart.setQuantity, cart.clear, totals, pending, error, methods, method, couponCode, remove],
  );
}

/* --------------------------------------------------------------- drawer bus */

const OPEN_EVENT = "framique:cart:open";

/**
 * Opens any mounted `cart_drawer` and reports whether one answered. The event
 * is cancellable and a mounted drawer cancels it, which lets the header keep a
 * real `/cart` link: the drawer intercepts the click when it exists, and the
 * navigation happens normally when it does not (or when JS has not loaded).
 */
export function openCartDrawer(): boolean {
  if (typeof window === "undefined") return false;
  const event = new CustomEvent(OPEN_EVENT, { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

export function useCartDrawerOpener(onOpen: () => void) {
  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      onOpen();
    };
    window.addEventListener(OPEN_EVENT, handler);
    return () => window.removeEventListener(OPEN_EVENT, handler);
  }, [onOpen]);
}
