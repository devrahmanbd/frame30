/**
 * The THEME's body — which of the platform's controls it carries, and does
 * its body render at all?
 *
 * The two production shells ask the SAME question with two answers:
 *
 *  - the **account** route: "does the theme's body place the profile card,
 *    or must the dashboard carry it?" The theme's body renders only when it
 *    declares the route-owned body slot (`page_content`) — `ThemeChrome`
 *    drops the theme's ENTIRE body otherwise (`themeRendersBody`) — so a
 *    merchant whose published body predates that slot places NOTHING, and
 *    the dashboard must carry the profile.
 *  - the **checkout** route: "does the theme's body carry a payment picker
 *    and an order summary, or must the route supply its own?" A checkout
 *    with no rail chosen and no total shown is not a checkout, whatever the
 *    theme published. And: "where does the place-order ACTION render?" — it
 *    is the route's, so when the theme's body renders, it comes AFTER the
 *    theme's band (the shopper meets it last, never before the rail and the
 *    total it pays).
 *
 * The theme's CHROME (its header and its footer) always renders, whatever
 * the body does — so a control in the chrome is a control the theme HAS,
 * and a control in the body is a control the theme has only while its body
 * renders.
 *
 * Pure data in, booleans out: no React, no DOM, no DB.
 */
import {
  flattenSections,
  type Section,
  type SectionType,
  type ThemeAst,
} from "./builder-ast";
import { themeRendersBody } from "./theme-body-slot";

/**
 * True when the theme's MAIN body renders for the route-owned body slot.
 *
 * The same predicate `ThemeChrome` asks (`themeRendersBody`), so the route
 * and the theme host can never disagree about whether the body is there.
 */
export function themeBodyRenders(ast: ThemeAst | null | undefined): boolean {
  return themeRendersBody(ast ?? null, "page_content");
}

/** The theme's main body, flattened (the sections nest in columns). */
function mainSections(ast: ThemeAst): Section[] {
  return flattenSections(ast.main);
}

/** The theme's chrome — its header and its footer, flattened. */
function chromeSections(ast: ThemeAst): Section[] {
  return [...flattenSections(ast.header), ...flattenSections(ast.footer)];
}

/**
 * Does this group of sections carry the control?
 *
 * An `invalid` section does not count: the renderer skips it and draws a
 * labelled error box instead, so the control is NOT there.
 */
function carries(sections: Section[], type: SectionType): boolean {
  return sections.some((section) => section.type === type && !section.invalid);
}

/**
 * The theme's account body places the profile card ITSELF.
 *
 * True only when the theme really renders one: in its chrome (which always
 * renders) or in a body that renders. False for a merchant whose published
 * account body predates the route-owned body slot — their body is dropped
 * whole, so the dashboard carries the profile instead.
 */
export function themePlacesAccountProfile(
  ast: ThemeAst | null | undefined,
): boolean {
  if (!ast) return false;
  if (carries(chromeSections(ast), "profile_card")) return true;
  if (!themeBodyRenders(ast)) return false;
  return carries(mainSections(ast), "profile_card");
}

/**
 * The theme's checkout body carries a PAYMENT PICKER.
 *
 * The platform's `payment_methods` widget is a real picker: it reads the
 * live cart and writes the shared cart's payment method. A theme body
 * without one leaves the shopper placing an order on the shared cart's
 * initial rail — so the route supplies its own picker when this is false.
 */
export function themeCarriesPaymentPicker(
  ast: ThemeAst | null | undefined,
): boolean {
  if (!ast) return false;
  if (carries(chromeSections(ast), "payment_methods")) return true;
  if (!themeBodyRenders(ast)) return false;
  return carries(mainSections(ast), "payment_methods");
}

/**
 * The theme's checkout body carries an ORDER SUMMARY.
 *
 * The platform's `cart_summary` widget renders the server's quote. A theme
 * body without one leaves the shopper placing an order with no total shown
 * — so the route supplies its own summary when this is false.
 */
export function themeCarriesOrderSummary(
  ast: ThemeAst | null | undefined,
): boolean {
  if (!ast) return false;
  if (carries(chromeSections(ast), "cart_summary")) return true;
  if (!themeBodyRenders(ast)) return false;
  return carries(mainSections(ast), "cart_summary");
}

/**
 * The controls a production checkout renders.
 *
 * The `fallback` is today's hand-built checkout: it ALWAYS carries the
 * payment picker and the order summary, and its place-order action stays
 * inside its own form. The `shell` is the route's body inside the theme's
 * frame — it carries the ROUTE's own picker and summary exactly when the
 * theme's body carries none, so a checkout never shows an order with no rail
 * chosen and no total.
 */
export function checkoutShellControls(
  ast: ThemeAst | null | undefined,
  variant: "shell" | "fallback",
): {
  showPaymentPicker: boolean;
  showSummary: boolean;
  /**
   * True when the place-order ACTION renders AFTER the theme's band.
   *
   * The theme's band carries the payment block and the order summary; the
   * action is the route's. When the theme's body renders, the shopper must
   * meet the action LAST — after the rail and after the total — so the route
   * renders it in its trailing slot (and names the route's own form through
   * the HTML form owner). The hand-built fallback has no band, so its action
   * stays inside its own form, unchanged.
   */
  submitAfterBody: boolean;
} {
  return {
    showPaymentPicker:
      variant === "fallback" || !themeCarriesPaymentPicker(ast),
    showSummary: variant === "fallback" || !themeCarriesOrderSummary(ast),
    submitAfterBody: variant === "shell" && themeBodyRenders(ast),
  };
}
