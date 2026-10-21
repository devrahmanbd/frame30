/**
 * The theme's body — which controls it carries — the unit suite.
 *
 * These are the decisions the two production shells make about a merchant's
 * PUBLISHED body, and each of them was a silent loss before:
 *
 *  - the account route decided "the theme places the profile card" from the
 *    AST alone, so a merchant whose body predates the route-owned body slot
 *    (the old `heading` + `profile_card` + `orders_list` composition) had
 *    their profile card dropped by `ThemeChrome` AND no dashboard copy —
 *    the profile card rendered NOWHERE;
 *  - the checkout route decided "the theme's frame supplies the payment
 *    picker and the order summary" without ever LOOKING, so a theme body
 *    with neither left a production checkout with no payment control and
 *    no total.
 */
import { describe, expect, it } from "vitest";
import type { Section, SectionType, ThemeAst } from "@/lib/builder-ast";
import {
  checkoutShellControls,
  themeBodyRenders,
  themeCarriesOrderSummary,
  themeCarriesPaymentPicker,
  themePlacesAccountProfile,
} from "./theme-shell-slots";

function section(type: SectionType, id: string = type): Section {
  return { id, type, props: {} };
}

function ast(
  main: Section[],
  extra?: { header?: Section[]; footer?: Section[] },
): ThemeAst {
  return {
    header: extra?.header ?? [],
    main,
    footer: extra?.footer ?? [],
  };
}

describe("the theme's body — does it render at all?", () => {
  it("renders only when the body declares the route-owned body slot", () => {
    expect(themeBodyRenders(ast([section("page_content")]))).toBe(true);
    expect(themeBodyRenders(ast([section("heading")]))).toBe(false);
    expect(themeBodyRenders(null)).toBe(false);
  });
});

describe("the account body — who places the profile card?", () => {
  it("gives the profile card to the theme when the theme renders one", () => {
    expect(
      themePlacesAccountProfile(
        ast([section("profile_card"), section("page_content")]),
      ),
    ).toBe(true);
  });

  it("gives the profile card to the DASHBOARD when the body predates the body slot", () => {
    // The merchant's published body is the OLD composition: no
    // `page_content`, so `ThemeChrome` drops the whole body — and the
    // profile card in it renders nowhere. The dashboard must carry it.
    const legacy = ast([
      section("heading", "h"),
      section("profile_card", "p"),
      section("orders_list", "o"),
    ]);
    expect(themeBodyRenders(legacy)).toBe(false);
    expect(themePlacesAccountProfile(legacy)).toBe(false);
  });

  it("gives the profile card to the dashboard when the body has no profile card", () => {
    expect(themePlacesAccountProfile(ast([section("page_content")]))).toBe(
      false,
    );
    expect(themePlacesAccountProfile(null)).toBe(false);
  });

  it("follows the theme's CHROME, which renders whatever the body does", () => {
    // A profile card in the theme's header is rendered even when the body
    // is dropped — so the theme places it, and the dashboard must not
    // show the shopper's details twice.
    const chrome = ast([section("heading", "h")], {
      header: [section("profile_card", "p")],
    });
    expect(themePlacesAccountProfile(chrome)).toBe(true);
  });
});

describe("the checkout body — which controls does the theme carry?", () => {
  it("sees a payment picker and a summary wherever they sit", () => {
    const body = ast([
      section("heading", "h"),
      section("payment_methods", "pm"),
      section("cart_summary", "cs"),
      section("page_content", "pc"),
    ]);
    expect(themeCarriesPaymentPicker(body)).toBe(true);
    expect(themeCarriesOrderSummary(body)).toBe(true);
  });

  it("sees a payment picker nested in the body's columns", () => {
    const columns = section("columns", "col");
    columns.children = [section("payment_methods", "pm")];
    const body = ast([columns, section("page_content", "pc")]);
    expect(themeCarriesPaymentPicker(body)).toBe(true);
  });

  it("reports NEITHER for a body that carries neither", () => {
    // The merchant published a checkout body with the route-owned body slot
    // but no payment block and no summary: the route must supply both.
    const body = ast([section("heading", "h"), section("page_content", "pc")]);
    expect(themeCarriesPaymentPicker(body)).toBe(false);
    expect(themeCarriesOrderSummary(body)).toBe(false);
  });

  it("does not count a control the renderer would skip", () => {
    // An `invalid` section draws a labelled error box, not the control.
    const broken = section("payment_methods", "pm");
    broken.invalid = "unknown_widget:payment_methods";
    const body = ast([broken, section("page_content", "pc")]);
    expect(themeCarriesPaymentPicker(body)).toBe(false);
  });

  it("does not count a control in a body that is dropped whole", () => {
    // No `page_content` — the body is dropped, so its payment block never
    // renders and the route's own picker is the one that is needed.
    const body = ast([section("payment_methods", "pm")]);
    expect(themeBodyRenders(body)).toBe(false);
    expect(themeCarriesPaymentPicker(body)).toBe(false);
  });
});

describe("the checkout shell — the controls it renders", () => {
  const WITH_BOTH = ast([
    section("payment_methods", "pm"),
    section("cart_summary", "cs"),
    section("page_content", "pc"),
  ]);
  const WITH_NEITHER = ast([
    section("heading", "h"),
    section("page_content", "pc"),
  ]);

  it("leaves the theme's own controls alone when the theme brings both", () => {
    // The theme's `payment_methods` widget and its `cart_summary` widget
    // are the real ones — the route adds nothing beside them.
    expect(checkoutShellControls(WITH_BOTH, "shell")).toEqual({
      showPaymentPicker: false,
      showSummary: false,
    });
  });

  it("supplies BOTH the route's own picker and its own summary when the theme brings neither", () => {
    // The defect this closes: a production checkout with no payment control
    // (the order would silently go out on the shared cart's initial "cod")
    // and no total shown.
    expect(checkoutShellControls(WITH_NEITHER, "shell")).toEqual({
      showPaymentPicker: true,
      showSummary: true,
    });
  });

  it("supplies the one the theme is missing", () => {
    const onlyPicker = ast([
      section("payment_methods", "pm"),
      section("page_content", "pc"),
    ]);
    expect(checkoutShellControls(onlyPicker, "shell")).toEqual({
      showPaymentPicker: false,
      showSummary: true,
    });
    const onlySummary = ast([
      section("cart_summary", "cs"),
      section("page_content", "pc"),
    ]);
    expect(checkoutShellControls(onlySummary, "shell")).toEqual({
      showPaymentPicker: true,
      showSummary: false,
    });
  });

  it("keeps BOTH controls in the hand-built fallback, whatever the theme published", () => {
    for (const body of [WITH_BOTH, WITH_NEITHER, null]) {
      expect(checkoutShellControls(body, "fallback")).toEqual({
        showPaymentPicker: true,
        showSummary: true,
      });
    }
  });
});
