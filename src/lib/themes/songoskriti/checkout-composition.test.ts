/**
 * Songoskriti `checkout` template — the platform-owned commerce composition.
 *
 * **The platform owns checkout.** It quotes the cart, offers the rails the
 * store can take money through and places the order
 * (`src/routes/store.$slug.checkout.tsx`). The theme owns the *composition*
 * only — the progress trail, the payment block and the order summary, all of
 * them platform-owned widgets reading the server's quote
 * (`src/components/builder/cart.tsx`).
 *
 * So the body carries **no** authored field, **no** authored price and
 * **no** authored "place order" action: the checkout FORM is the ROUTE's, and
 * it reaches the theme's frame through the platform's route-owned body slot
 * (`page_content`) — Decision **D2'**, which supersedes **D2** ("the
 * production route discards the theme's AST"). The assertions below pin
 * exactly that, and the last one pins that the route keeps every platform
 * authority it had.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  catalogEntry,
  flattenSections,
  lintTemplate,
  primarySectionId,
  type SectionBuilder,
  type ThemeAst,
} from "../../builder-ast";
import { songoskritiPreviewSource } from "./preview";

/** The plain builder the engine uses. */
function plainBuilder(): SectionBuilder {
  let n = 0;
  return (type, props = {}) => ({
    id: `${type}-${n++}`,
    type,
    props: { ...props },
  });
}

function checkoutAst(): ThemeAst {
  return {
    header: [],
    main: songoskritiPreviewSource().main("checkout", plainBuilder())!,
    footer: [],
  };
}

const main = checkoutAst().main;
const types = main.map((section) => section.type);

describe("songoskriti checkout composition", () => {
  it("authors the platform's commerce widgets in the exact order", () => {
    expect(types).toEqual([
      "heading",
      "checkout_steps",
      "page_content",
      "columns",
    ]);
  });

  it("puts the route's own body BEFORE the payment block and the summary", () => {
    // The shopper reads the address FIRST and picks the rail with the total
    // in view. The route's own body (`page_content`) therefore precedes the
    // two-column payment/summary band.
    //
    // The place-order ACTION is the route's and renders after that whole
    // band (the route's trailing slot — see
    // `src/routes/checkout-dom-order.test.tsx`, which measures the rendered
    // order). The theme's composition never carries it.
    const bodyAt = types.indexOf("page_content");
    const bandAt = types.indexOf("columns");
    expect(bodyAt).toBeGreaterThanOrEqual(0);
    expect(bandAt).toBeGreaterThanOrEqual(0);
    expect(bodyAt, "the route's body must come first").toBeLessThan(bandAt);
  });

  it("carries NO form, NO input and NO submit button of its own", () => {
    // The theme may only ARRANGE platform-owned pieces. The action, the
    // fields and the order write are the route's: the theme authors no
    // `form`, no `input` and no submit button, and no prop that could make
    // a section render one.
    const authored = flattenSections(main);
    for (const section of authored) {
      expect(
        ["form", "input", "submit", "button", "form_action"].includes(
          section.type,
        ),
        `${section.type} would author a control the platform owns`,
      ).toBe(false);
      for (const [key, value] of Object.entries(section.props)) {
        if (typeof value !== "string") continue;
        expect(
          /<\s*(form|input|button)\b/i.test(value),
          `${section.type}.${key} would inject markup the platform owns`,
        ).toBe(false);
      }
    }
  });

  it("holds nothing but platform-owned commerce widgets", () => {
    // The two `container` entries are the `columns` children — no authored
    // form, no authored money, no authored "place order" action. The
    // `page_content` entry is the platform's own route-owned body slot: it
    // renders whatever the HOST grants (the route's checkout form).
    expect(flattenSections(main).map((section) => section.type)).toEqual([
      "heading",
      "checkout_steps",
      "page_content",
      "columns",
      "container",
      "payment_methods",
      "payment_icons",
      "container",
      "cart_summary",
    ]);
  });

  it("uses only platform-owned commerce widgets and layout primitives", () => {
    // The checkout body can never carry a bespoke field or a bespoke price.
    const allowed = new Set([
      "heading",
      "columns",
      "container",
      "checkout_steps",
      "payment_methods",
      "payment_icons",
      "cart_summary",
      "cart_lines",
      "page_content",
    ]);
    for (const section of flattenSections(main)) {
      expect(
        allowed.has(section.type),
        `${section.type} is not a platform-owned commerce widget`,
      ).toBe(true);
      expect(catalogEntry(section.type), section.type).toBeDefined();
    }
  });

  it("has zero lint errors on the checkout template", () => {
    // `checkout` is NOT a route-h1 template, so the body must carry exactly
    // one <h1> claimant — the `cart_summary` panel is it, because the
    // payment block's heading is deliberately blank (the platform's own
    // documented remedy, `src/lib/builder-ast.ts:8506-8513`).
    expect(
      lintTemplate(checkoutAst(), "checkout").filter(
        (i) => i.level === "error",
      ),
    ).toEqual([]);
  });

  it("claims the page's primary heading exactly once", () => {
    expect(primarySectionId(checkoutAst())).toBe("heading-0");
  });

  it("carries no money-like literal", () => {
    // No price, no total, no amount is authored in the checkout body; the
    // money comes from the platform's quote.
    const moneyish: string[] = [];
    for (const section of flattenSections(main)) {
      for (const [key, value] of Object.entries(section.props)) {
        if (typeof value === "string" && /[৳$]\s?\d|\d{4,}/.test(value)) {
          moneyish.push(`${section.type}.${key} = ${value}`);
        }
        if (typeof value === "number" && /\d{4,}/.test(String(value))) {
          moneyish.push(`${section.type}.${key} = ${value}`);
        }
      }
    }
    expect(moneyish).toEqual([]);
  });

  it("keeps the platform's authority in the production checkout route", () => {
    // Decision D2' — the theme's checkout body is the SHELL; the route keeps
    // the form, the customer fields, the server quote, the validation and the
    // order write. The route's authority is asserted, not assumed.
    const route = readFileSync("src/routes/store.$slug.checkout.tsx", "utf8");
    expect(route).toContain("ast={ast}");
    expect(route).toContain('contentSlot="page_content"');
    expect(route).toContain("quoteCart(");
    expect(route).toContain("reserveCheckout(");
    expect(route).toContain("releaseCheckout(");
    expect(route).toContain("placeOrder(");
    expect(route).toContain('form.get("name")');
    expect(route).toContain('form.get("phone")');
  });
});
