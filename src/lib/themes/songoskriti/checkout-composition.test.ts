/**
 * Songoskriti `checkout` template — the platform-owned commerce composition.
 *
 * **The platform owns checkout.** It quotes the cart, offers the rails the
 * store can take money through and places the order
 * (`src/routes/store.$slug.checkout.tsx:42-105`, `:428+`). The theme owns
 * the *composition* only — the progress trail, the payment block and the
 * order summary, all of them platform-owned widgets reading the server's
 * quote (`src/components/builder/cart.tsx:506`, `:563`, `:441`).
 *
 * So the body carries **no** authored field, **no** authored price and
 * **no** authored "place order" action: in production the route renders its
 * own form (`ast={null}`, `src/routes/store.$slug.checkout.tsx:418-421`).
 * The assertions below pin exactly that — and the last one pins that the
 * production route is still untouched by this work.
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
    expect(types).toEqual(["heading", "checkout_steps", "columns"]);
  });

  it("holds nothing but platform-owned commerce widgets", () => {
    // The two `container` entries are the `columns` children — no authored
    // form, no authored money, no authored "place order" action.
    expect(flattenSections(main).map((section) => section.type)).toEqual([
      "heading",
      "checkout_steps",
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

  it("leaves the production checkout route untouched", () => {
    // The theme changed; the route did not. In production the checkout form
    // is hand-built (server-quoted totals, live rails), so the theme
    // contributes the tokens only (`ast={null}`).
    const route = readFileSync("src/routes/store.$slug.checkout.tsx", "utf8");
    expect(route).toContain("ast={null}");
    expect(route).toContain("the theme contributes the tokens only");
  });
});
