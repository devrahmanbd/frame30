/**
 * The distinctness gate's **re-run for the new compositions** — the Cart, the
 * Checkout and the Account bodies Task 2 rebuilt on the composable pieces.
 *
 * **Why this suite exists.** The gate's own suite
 * (`template-distinctness.test.ts`) walks the templates generically, so it
 * would keep passing if one row went quiet. A table that quietly drops a
 * template — or a rule — is a gate that quietly stops guarding it (the plan's
 * Review Focus 5). This suite therefore pins the three REBUILT rows
 * **explicitly**, and it re-runs the two properties the gate exists for:
 *
 *  1. **the `cart` row forbids `orders_list`** — the account's orders live in
 *     the account's dashboard, so a commerce surface must never carry the
 *     orders list; and the row is **not vacuous**: a cart body that carries
 *     one is rejected;
 *  2. **the `checkout` row still forbids any authored field or price** — the
 *     platform owns the customer fields, the validation, the rails and the
 *     totals, so the checkout body carries platform-owned commerce widgets
 *     only, and the row still rejects the demo-copy shape;
 *  3. **every template a theme does not author is rejected as generic** — the
 *     theme-agnostic property, re-run over the machinery alone.
 *
 * The machinery under test is the SAME machinery the other ten templates use
 * (`checkSongoskritiTemplateDistinctness`); this suite is a **focused** suite,
 * not a second implementation.
 */
import { describe, expect, it } from "vitest";
import {
  TEMPLATE_KEYS,
  catalogEntry,
  flattenSections,
  type Section,
  type SectionBuilder,
  type SectionType,
  type TemplateKey,
} from "../../builder-ast";
import {
  genericDemoMain,
  type PreviewThemeSource,
} from "../../theme-preview-nav";
import {
  SONOSKRITI_TEMPLATE_EXPECTATIONS,
  checkSongoskritiTemplateDistinctness,
  checkTemplateDistinctness,
  previewSourceMainTypes,
} from "./template-distinctness";
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

/**
 * Minimal synthetic source for the theme-agnostic property: it authors ONE
 * surface (`index`) and declines every other template, so the engine's
 * generic body is the only body those templates can have.
 */
function syntheticThemeSource(): PreviewThemeSource {
  return {
    key: "synthetic-theme",
    themeName: "Synthetic",
    author: "test",
    tokens: songoskritiPreviewSource().tokens,
    header: () => [],
    footer: () => [],
    main: (template, s) =>
      template === "index" ? [s("hero_carousel")] : null,
  };
}

/** The theme's own shipped body for one template. */
function shippedMain(template: TemplateKey): Section[] {
  return songoskritiPreviewSource().main(template, plainBuilder())!;
}

/** A body built from a list of types. */
function fixtureBody(types: readonly string[]): Section[] {
  return types.map((type, index) => ({
    id: `${type}-${index}`,
    type: type as SectionType,
    props: {},
  }));
}

/** The rule ids the gate reported for one body. */
function ruleIdsOf(template: TemplateKey, main: readonly Section[]): string[] {
  return checkSongoskritiTemplateDistinctness(template, { main }).map(
    (issue) => issue.rule,
  );
}

/** The three rebuilt bodies — the ones Task 2 rewrote. */
const REBUILT: readonly TemplateKey[] = ["cart", "checkout", "account"];

describe("the distinctness gate, re-run for the dynamic compositions", () => {
  it("passes the three rebuilt bodies", () => {
    for (const key of REBUILT) {
      const issues = checkSongoskritiTemplateDistinctness(key, {
        main: shippedMain(key),
      });
      expect(
        issues.map((issue) => `${issue.rule}: ${issue.message}`),
        `the rebuilt ${key} body must pass the gate`,
      ).toEqual([]);
    }
  });

  it("carries every type and every functional slot its row requires", () => {
    // The rows ARE the gate's subject: a rebuilt body that stopped carrying a
    // required type or slot would have been rejected above, and this asserts
    // the same thing from the row's side — so a row that quietly lost a
    // requirement fails here too.
    for (const key of REBUILT) {
      const row = SONOSKRITI_TEMPLATE_EXPECTATIONS[key];
      const carried = new Set(
        flattenSections(shippedMain(key)).map((section) => section.type),
      );
      for (const type of row.requiredTypes) {
        expect(
          carried.has(type),
          `the rebuilt ${key} body must carry its required type ${type}`,
        ).toBe(true);
      }
      for (const slot of row.requiredSlots) {
        expect(
          carried.has(slot),
          `the rebuilt ${key} body must carry its functional slot ${slot}`,
        ).toBe(true);
      }
    }
  });

  it("the cart row forbids `orders_list` — the account's orders live in the dashboard", () => {
    const row = SONOSKRITI_TEMPLATE_EXPECTATIONS.cart;
    expect(
      row.forbiddenTypes,
      "the cart row must forbid the orders list",
    ).toContain("orders_list");
    expect(
      row.forbiddenTypes,
      "the cart row must forbid the demo rail too",
    ).toContain("product_rail");

    // The shipped cart body carries none of them.
    const carried = flattenSections(shippedMain("cart")).map(
      (section) => section.type,
    );
    for (const forbidden of row.forbiddenTypes) {
      expect(
        carried,
        `the shipped cart body must not carry ${forbidden}`,
      ).not.toContain(forbidden);
    }

    // And the row is NOT vacuous: a cart body that carries the orders list
    // is rejected, for that reason.
    const withOrders = fixtureBody(["heading", "columns", "orders_list"]);
    expect(
      ruleIdsOf("cart", withOrders),
      "a cart body carrying the orders list must be rejected",
    ).toEqual(expect.arrayContaining(["R5-no-forbidden-types"]));
  });

  it("the checkout row still forbids any authored field or price", () => {
    const row = SONOSKRITI_TEMPLATE_EXPECTATIONS.checkout;
    // The row still rejects the demo-copy shape.
    expect(
      row.forbiddenTypes,
      "the checkout row must forbid the demo copy",
    ).toContain("rich_text");
    const withCopy = fixtureBody([
      "heading",
      "checkout_steps",
      "page_content",
      "columns",
      "rich_text",
    ]);
    expect(
      ruleIdsOf("checkout", withCopy),
      "a checkout body carrying the demo copy must be rejected",
    ).toEqual(expect.arrayContaining(["R5-no-forbidden-types"]));

    // And the rebuilt checkout body authors NO field and NO price: the
    // platform owns the customer fields, the validation, the rails and the
    // totals, so the body carries platform-owned commerce widgets only.
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
    const moneyish: string[] = [];
    for (const section of flattenSections(shippedMain("checkout"))) {
      expect(
        allowed.has(section.type),
        `${section.type} is not a platform-owned commerce widget`,
      ).toBe(true);
      expect(catalogEntry(section.type), section.type).toBeDefined();
      for (const [key, value] of Object.entries(section.props)) {
        if (typeof value === "string" && /[৳$]\s?\d|\d{4,}/.test(value)) {
          moneyish.push(`${section.type}.${key} = ${value}`);
        }
        if (typeof value === "number" && /\d{4,}/.test(String(value))) {
          moneyish.push(`${section.type}.${key} = ${value}`);
        }
      }
    }
    expect(
      moneyish,
      "the rebuilt checkout body authors no money — the quote is the server's",
    ).toEqual([]);
  });

  it("rejects the engine's generic body for every template a theme does not author", () => {
    const source = syntheticThemeSource();

    // The PROPERTY, not a theme's inventory: a template the theme does not
    // author has NO theme-owned body — the engine synthesises its generic
    // demo body — and the gate rejects that body.
    let unAuthored = 0;
    for (const key of TEMPLATE_KEYS) {
      const main = source.main(key, plainBuilder());
      if (main !== null) {
        expect(
          main.map((section) => section.type),
          `the authored ${key} body must not be the engine's generic body`,
        ).not.toEqual(["heading", "rich_text"]);
        continue;
      }
      unAuthored += 1;

      const generic = genericDemoMain(key, plainBuilder());
      expect(
        generic.map((section) => section.type),
        `the ${key} fall-through body must be the engine's generic body`,
      ).toEqual(["heading", "rich_text"]);

      // The gate REJECTS it — on the MACHINERY alone: Songoskriti's own
      // expectations are not applied to another theme.
      const issues = checkTemplateDistinctness(
        key,
        { main: generic },
        {
          expectations: {},
          peerMainTypes: previewSourceMainTypes(source),
        },
      );
      expect(
        issues.map((issue) => issue.rule),
        `the gate must reject the generic body for the un-authored ${key}`,
      ).toEqual(expect.arrayContaining(["R1-not-generic"]));
    }
    // The theme authors at least one surface — otherwise the loop above
    // would prove nothing.
    expect(unAuthored).toBeGreaterThan(0);
    expect(unAuthored).toBeLessThan(TEMPLATE_KEYS.length);
  });
});
