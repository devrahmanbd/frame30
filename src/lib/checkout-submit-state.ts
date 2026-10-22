/**
 * The place-order ACTION's state — the checkout's one decision, PURE.
 *
 * The server decides whether the shopper may submit. The server also decides
 * which rails this store may offer — and a store that offers NO rail cannot
 * take the money, so the action is DISABLED and the notice says why (the
 * plan's **D8**). The theme draws the rail; it never decides whether one
 * exists.
 *
 * It lives here, beside the shared "no rail" sentence
 * (`src/lib/payment-rail-empty.ts`), so the rail-less case can be RENDERED
 * and asserted instead of being read out of the route's source text: the
 * button is disabled, and the notice names the reason.
 *
 * Pure data in, one state out: no React, no DOM, no DB.
 */
import { noPaymentRailMessage } from "./payment-rail-empty";
import type { Lang } from "./i18n";

/**
 * The action's state — the label, whether the shopper may submit, and the
 * live-region notice under the action.
 */
export type CheckoutSubmitState = {
  /** The action's label. */
  label: string;
  /** True while the shopper may not submit (no quote yet, or an order in flight). */
  disabled: boolean;
  /** The live-region notice under the action while the order is in flight. */
  notice: string | null;
};

/**
 * The locale-only translator — the same rule `useLang()`'s `t` applies,
 * without the hook (this function is pure and SSR-safe).
 */
function translate(lang: Lang, en: string, bn: string): string {
  return lang === "bn" && bn ? bn : en;
}

/**
 * The place-order action's state, from the server's own inputs.
 *
 * `offered` is the SERVER's rail list — the only input that decides the
 * rail-less case. `totals` is the server quote; a pending mutation and a
 * charge hop in flight each disable the action too.
 */
export function checkoutSubmitState({
  totals,
  pending,
  chargeHop,
  offered,
  lang,
  label,
}: {
  /** The server quote's totals — null while the quote is in flight. */
  totals: object | null | undefined;
  /** True while the order mutation is running. */
  pending: boolean;
  /** The charge hop's state. */
  chargeHop: "idle" | "redirecting";
  /** The rails the SERVER offered — the only input that decides the rail-less case. */
  offered: readonly string[];
  /** The current language. */
  lang: Lang;
  /** The action's label (the route's own words). */
  label: string;
}): CheckoutSubmitState {
  const noRail = offered.length === 0;
  const disabled = !totals || pending || chargeHop === "redirecting" || noRail;
  const notice =
    pending || chargeHop === "redirecting"
      ? chargeHop === "redirecting"
        ? translate(
            lang,
            "Contacting the payment provider — do not close this page.",
            "পেমেন্ট প্রোভাইডারের সাথে যোগাযোগ করা হচ্ছে — এই পেজ বন্ধ করবেন না।",
          )
        : translate(lang, "Placing your order…", "অর্ডার করা হচ্ছে…")
      : noRail
        ? noPaymentRailMessage(lang)
        : null;
  return { label, disabled, notice };
}
