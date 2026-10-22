/**
 * The ONE "no payment rail" sentence.
 *
 * **Why it exists.** The checkout's "the server offered no rail" state used
 * to have TWO sentences: the theme's widget said *"No payment method is
 * available right now."* (`src/components/builder/cart.tsx`) and the route's
 * own picker said *"This store has not enabled any payment method yet."*
 * (`src/routes/store.$slug.checkout.tsx`). One state, two sentences — and
 * the place-order button stayed ENABLED beside them (the plan's **D8**).
 *
 * **One place, one sentence.** The theme's widget and the route's picker
 * both read this constant, so the state says the same thing wherever the
 * shopper meets it. The catalogue's `payment_methods.emptyText` default is
 * the same string, so a merchant who authored no copy sees the same
 * sentence.
 *
 * **No copy is authored here.** The English text is the WIDGET's existing
 * sentence — the one the widget's own suite
 * (`src/components/builder/cart-payment-methods.test.tsx`) and the browser
 * lane (`.e2e/songoskriti-storefront-surfaces.spec.ts`) already pin — and the
 * বাংলা text is the widget's existing বাংলা sentence, verbatim. The
 * translation meter therefore reports exactly what it reported before.
 */

/** The sentence, in both languages the platform ships. */
export const NO_PAYMENT_RAIL = {
  en: "No payment method is available right now.",
  bn: "এই মুহূর্তে কোনো পেমেন্ট পদ্ধতি নেই।",
} as const;

/** The sentence for one locale. */
export function noPaymentRailMessage(locale: string): string {
  return locale === "bn" ? NO_PAYMENT_RAIL.bn : NO_PAYMENT_RAIL.en;
}
