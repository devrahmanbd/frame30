/**
 * The Songoskriti template-distinctness gate — its own acceptance suite.
 *
 * The gate is only worth something if it has **failed before**: a rule that
 * only ever passes proves nothing (the plan's Review Focus 5). So this suite
 * does four things:
 *
 * 1. it feeds the gate the **legacy** bodies — the four pre-Phase-2
 *    compositions the freeze pin used to hold, plus the engine's own generic
 *    demo body — and asserts that each one is **rejected, for the right
 *    reasons** (the rule ids differ per body, and no rule is asserted that
 *    cannot fire);
 * 2. it asserts the gate **passes the nine shipped bodies** — the gate is
 *    worthless if it rejects what the theme actually ships;
 * 3. it asserts the gate catches the **engine's** generic body, built by
 *    `genericDemoMain` itself;
 * 4. it asserts **every rule has a firing fixture** — so removing a rule
 *    from the implementation fails this file, not silently weakens the gate;
 * 5. it asserts the **exceptions are documented, not silent**, and that the
 *    gate has **no lint rule**.
 *
 * The gate's subject is composition, functional slots and structure — never
 * lint cleanliness (`src/lib/themes/songoskriti/template-distinctness.ts`).
 */
import { describe, expect, it } from "vitest";
import {
  TEMPLATE_KEYS,
  catalogEntry,
  flattenSections,
  type PropValue,
  type Section,
  type SectionBuilder,
  type SectionType,
  type TemplateKey,
} from "../../builder-ast";
import { genericDemoMain } from "../../theme-preview-nav";
import { somvabonaPreviewSource } from "../somvabona/preview";
import {
  SONOSKRITI_APPROVED_EXCEPTIONS,
  SONOSKRITI_DISTINCTNESS_RULES,
  SONOSKRITI_LEGACY_COMPOSITIONS,
  SONOSKRITI_TEMPLATE_EXPECTATIONS,
  checkSongoskritiTemplateDistinctness,
  checkTemplateDistinctness,
  previewSourceMainTypes,
} from "./template-distinctness";
import { songoskritiPreviewSource } from "./preview";

/** The plain builder the engine uses — the theme's own skin/variation wrap
 *  happens INSIDE `main` (`src/lib/themes/songoskriti/preview.ts:89`). */
function plainBuilder(): SectionBuilder {
  let n = 0;
  return (type, props = {}) => ({
    id: `${type}-${n++}`,
    type,
    props: { ...props },
  });
}

/** The theme's own shipped body for one template. */
function shippedMain(template: TemplateKey): Section[] {
  return songoskritiPreviewSource().main(template, plainBuilder())!;
}

/** A body built from a list of types — the legacy fixtures carry types only. */
function fixtureBody(
  types: readonly string[],
  props: Record<string, Record<string, PropValue>> = {},
): Section[] {
  return types.map((type, index) => ({
    id: `${type}-${index}`,
    type: type as SectionType,
    props: props[type] ?? {},
  }));
}

/**
 * The platform's own `<h1>` claimant rule, measured **independently** of the
 * gate (`src/lib/builder-ast.ts:8496-8514`): the `heading` widget type is
 * skipped entirely (`:8500-8504` — the `heading` section IS the primary, so
 * it is never a second claimant), and every other catalogue widget with
 * `heading: true` counts unless its `heading` prop is deliberately blank
 * (`:8506-8513`; `blankHeading`, `:8301-8313`).
 */
function claimantsOf(main: readonly Section[]): string[] {
  const claimants: string[] = [];
  for (const section of flattenSections([...main])) {
    const entry = catalogEntry(section.type);
    if (!entry) continue;
    if (section.type === "heading") continue;
    if (!entry.heading) continue;
    const value = section.props["heading"];
    if (typeof value === "string" && value.trim() === "") continue;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const bag = value as unknown as Record<string, unknown>;
      const parts = ["en", "bn"].map((key) =>
        typeof bag[key] === "string" ? (bag[key] as string).trim() : "",
      );
      if (parts.every((part) => part === "")) continue;
    }
    claimants.push(`${section.type}:${section.id}`);
  }
  return claimants;
}

/** The rule ids the gate reported for one body. */
function ruleIdsOf(template: TemplateKey, main: readonly Section[]): string[] {
  return checkSongoskritiTemplateDistinctness(template, { main }).map(
    (issue) => issue.rule,
  );
}

describe("songoskriti template distinctness gate", () => {
  it("rejects the legacy bodies — the gate has failed before", () => {
    // The four pre-Phase-2 bodies this plan replaces, quoted verbatim from
    // the freeze pin (`src/components/builder/songoskriti-port-freeze.test.tsx:107-110`).
    const legacyCases: {
      key: TemplateKey;
      types: readonly string[];
      rules: string[];
      notRules: string[];
    }[] = [
      {
        key: "search",
        types: SONOSKRITI_LEGACY_COMPOSITIONS.search!,
        rules: [
          "R1-not-generic",
          "R2-theme-composition",
          "R3-functional-slots",
          "R5-no-forbidden-types",
        ],
        notRules: [],
      },
      {
        key: "blog",
        types: SONOSKRITI_LEGACY_COMPOSITIONS.blog!,
        rules: [
          "R1-not-generic",
          "R2-theme-composition",
          "R3-functional-slots",
          "R5-no-forbidden-types",
        ],
        notRules: [],
      },
      {
        key: "cart",
        types: SONOSKRITI_LEGACY_COMPOSITIONS.cart!,
        rules: [
          "R1-not-generic",
          "R3-functional-slots",
          "R5-no-forbidden-types",
        ],
        // The legacy cart body already carries `heading` and `columns` — the
        // two types the cart row requires — so `R2` does NOT fire on it.
        notRules: ["R2-theme-composition"],
      },
      {
        key: "checkout",
        types: SONOSKRITI_LEGACY_COMPOSITIONS.checkout!,
        rules: ["R2-theme-composition", "R3-functional-slots"],
        // It carries no generic demo section (so no `R1`) and no forbidden
        // type (so no `R5`): `rich_text` is the only forbidden type on
        // `checkout` and the fixture has none.
        notRules: ["R1-not-generic", "R5-no-forbidden-types"],
      },
    ];

    for (const { key, types, rules, notRules } of legacyCases) {
      const ids = ruleIdsOf(key, fixtureBody(types));
      expect(
        ids.length,
        `the legacy ${key} body must be rejected; the gate reported: ${ids.join(", ")}`,
      ).toBeGreaterThan(0);
      expect(
        ids,
        `the legacy ${key} body must be rejected for its own reasons`,
      ).toEqual(expect.arrayContaining(rules));
      for (const rule of notRules) {
        expect(
          ids,
          `the legacy ${key} body must not trip ${rule}`,
        ).not.toContain(rule);
      }
    }

    // The legacy checkout body is ALSO a duplicate of the shipped cart body
    // (`["heading","columns"]`) — a second, independent reason it is not a
    // distinct template.
    expect(ruleIdsOf("checkout", fixtureBody(legacyCases[3].types))).toContain(
      "R6-distinct-across-templates",
    );

    // The engine's generic demo body is rejected on EVERY template — it is
    // `genericDemoMain`'s own output.
    for (const key of TEMPLATE_KEYS) {
      const ids = ruleIdsOf(
        key,
        fixtureBody(SONOSKRITI_LEGACY_COMPOSITIONS.generic!),
      );
      expect(
        ids,
        `the generic body must be rejected on ${key}; the gate reported: ${ids.join(", ")}`,
      ).toEqual(expect.arrayContaining(["R1-not-generic"]));
    }

    // On `search` the generic body trips the composition, slot and forbidden
    // rules as well.
    expect(
      ruleIdsOf("search", fixtureBody(SONOSKRITI_LEGACY_COMPOSITIONS.generic!)),
    ).toEqual(
      expect.arrayContaining([
        "R1-not-generic",
        "R2-theme-composition",
        "R3-functional-slots",
        "R5-no-forbidden-types",
      ]),
    );
  });

  it("passes the nine shipped bodies", () => {
    for (const key of TEMPLATE_KEYS) {
      const main = shippedMain(key);
      const issues = checkSongoskritiTemplateDistinctness(key, { main });
      expect(
        issues.map((issue) => `${issue.rule}: ${issue.message}`),
        `the shipped ${key} body must pass the gate`,
      ).toEqual([]);
    }

    // The structure the cart fix buys: the cart body's `<h1>` claimants
    // number exactly ONE (the order summary). The shipped cart body had TWO
    // claimants and one lint error ("More than one widget claims the page
    // <h1>", `src/lib/builder-ast.ts:8516-8523`); the platform's own
    // remedy — a deliberately blank heading on the lines block
    // (`:8506-8513`) — is what makes it one.
    const cartClaimants = claimantsOf(shippedMain("cart"));
    expect(cartClaimants).toHaveLength(1);
    expect(cartClaimants[0]).toContain("cart_summary");

    // The checkout body's likewise: the order summary claims it and the
    // payment block's heading is deliberately blank.
    const checkoutClaimants = claimantsOf(shippedMain("checkout"));
    expect(checkoutClaimants).toHaveLength(1);
    expect(checkoutClaimants[0]).toContain("cart_summary");
  });

  it("catches the engine's generic body", () => {
    // Built by the engine's own function — not by hand — so the fixture
    // cannot drift from what a theme that authored nothing would ship.
    const main = genericDemoMain("search", plainBuilder());
    const ids = checkSongoskritiTemplateDistinctness("search", { main }).map(
      (issue) => issue.rule,
    );
    expect(ids, "the engine's generic body must be caught").toEqual(
      expect.arrayContaining(["R1-not-generic"]),
    );
  });

  it("has a firing fixture for every rule", () => {
    // R4 — the `page` body carrying a demo string: the Phase-1 defect's
    // shape. The demo copy would impersonate the merchant's CMS record.
    const demoPage = fixtureBody(["breadcrumb", "page_content"], {
      page_content: { body: "Size guide — how to measure" },
    });
    const demoPageIds = ruleIdsOf("page", demoPage);
    expect(demoPageIds).toEqual(expect.arrayContaining(["R4-no-demo-copy"]));

    // The "Demo" marker is caught too, even without a retired string.
    const markerPage = fixtureBody(["breadcrumb", "page_content"], {
      page_content: { body: "Demo page" },
    });
    expect(ruleIdsOf("page", markerPage)).toEqual(
      expect.arrayContaining(["R4-no-demo-copy"]),
    );

    // R7 — a body carrying TWO `heading: true` widgets that are not the
    // `heading` type: the shipped cart body's shape BEFORE Task 6 fixed it
    // (the lines block and the summary both claimed the page `<h1>`).
    const twoClaimants = fixtureBody(["heading", "columns"]);
    const columns = twoClaimants[1];
    columns.children = [
      {
        id: "container-0",
        type: "container",
        props: {},
        children: [
          {
            id: "cart_lines-0",
            type: "cart_lines",
            props: { heading: "Items" },
          },
        ],
      },
      {
        id: "container-1",
        type: "container",
        props: {},
        children: [
          {
            id: "cart_summary-0",
            type: "cart_summary",
            props: { heading: "Order summary" },
          },
        ],
      },
    ];
    expect(claimantsOf(twoClaimants)).toHaveLength(2);
    expect(ruleIdsOf("cart", twoClaimants)).toEqual(
      expect.arrayContaining(["R7-one-primary-heading"]),
    );

    // The platform's own exclusion — the `heading` widget type is never a
    // second claimant — is what keeps the plan's own bodies at one.
    expect(claimantsOf(shippedMain("cart"))).toHaveLength(1);
    expect(claimantsOf(shippedMain("checkout"))).toHaveLength(1);

    // Every rule has a fixture that fires it: removing a rule from the gate
    // leaves its id uncovered, and this assertion fails.
    const fired = new Set<string>([
      ...ruleIdsOf(
        "search",
        fixtureBody(SONOSKRITI_LEGACY_COMPOSITIONS.search!),
      ),
      ...ruleIdsOf("blog", fixtureBody(SONOSKRITI_LEGACY_COMPOSITIONS.blog!)),
      ...ruleIdsOf("cart", fixtureBody(SONOSKRITI_LEGACY_COMPOSITIONS.cart!)),
      ...ruleIdsOf(
        "checkout",
        fixtureBody(SONOSKRITI_LEGACY_COMPOSITIONS.checkout!),
      ),
      ...ruleIdsOf("search", genericDemoMain("search", plainBuilder())),
      ...demoPageIds,
      ...ruleIdsOf("cart", twoClaimants),
    ]);
    expect([...fired].sort()).toEqual(
      [...SONOSKRITI_DISTINCTNESS_RULES].sort(),
    );
  });

  it("documents the exceptions and keeps lint out of the gate", () => {
    expect(Object.keys(SONOSKRITI_APPROVED_EXCEPTIONS).sort()).toEqual([
      "blog",
      "checkout",
      "page",
      "search",
    ]);
    for (const [key, exception] of Object.entries(
      SONOSKRITI_APPROVED_EXCEPTIONS,
    )) {
      expect(exception.reason.length, `${key} reason`).toBeGreaterThanOrEqual(
        40,
      );
      expect(exception.basis.length, `${key} basis`).toBeGreaterThan(0);
    }

    // Each exception names what it rests on.
    expect(SONOSKRITI_APPROVED_EXCEPTIONS.checkout!.basis).toContain("D2");
    expect(SONOSKRITI_APPROVED_EXCEPTIONS.blog!.basis).toContain("D5");
    expect(SONOSKRITI_APPROVED_EXCEPTIONS.search!.basis).toContain("D7");
    expect(SONOSKRITI_APPROVED_EXCEPTIONS.page!.basis).toContain(
      "PageView.tsx:216",
    );
    expect(SONOSKRITI_APPROVED_EXCEPTIONS.page!.basis).toContain(
      "StoreHomepage.tsx:120",
    );

    // The exceptions are CONSULTED by `R2`/`R3` — they ride along with the
    // finding instead of suppressing it, so a reader can tell an approved
    // exception from a loophole.
    const pageIssues = checkSongoskritiTemplateDistinctness("page", {
      main: fixtureBody(["breadcrumb"]),
    });
    const composition = pageIssues.find(
      (issue) => issue.rule === "R2-theme-composition",
    );
    expect(composition?.exception?.basis).toContain("PageView.tsx:216");

    // The table is total: a table that quietly drops a template is a gate
    // that quietly stops guarding it.
    expect(Object.keys(SONOSKRITI_TEMPLATE_EXPECTATIONS).sort()).toEqual(
      [...TEMPLATE_KEYS].sort(),
    );

    // The gate has NO lint rule — the former `R7-lint-clean` is gone: the
    // platform's lint is a different concern (the shipped `index` body
    // alone carries 22 translation-coverage warnings).
    expect(SONOSKRITI_DISTINCTNESS_RULES).toEqual([
      "R1-not-generic",
      "R2-theme-composition",
      "R3-functional-slots",
      "R4-no-demo-copy",
      "R5-no-forbidden-types",
      "R6-distinct-across-templates",
      "R7-one-primary-heading",
    ]);
  });
});

describe("the distinctness gate is theme-agnostic", () => {
  it("runs against another theme's bodies — Somvabona's un-authored templates are the engine's generic body", () => {
    const source = somvabonaPreviewSource();
    const authored: TemplateKey[] = [];
    const generic: TemplateKey[] = [];
    for (const key of TEMPLATE_KEYS) {
      const main = source.main(key, plainBuilder());
      if (main === null) generic.push(key);
      else authored.push(key);
    }

    // Measured: Somvabona authors three surfaces; the other six fall through
    // to the engine's generic demo body.
    expect(authored).toEqual(["index", "product", "collection"]);
    expect(generic).toEqual([
      "account",
      "page",
      "blog",
      "cart",
      "checkout",
      "search",
    ]);
    expect(
      genericDemoMain("search", plainBuilder()).map((section) => section.type),
    ).toEqual(["heading", "rich_text"]);

    // The gate's MACHINERY is theme-agnostic: the same checker, reading this
    // theme's own bodies, rejects the generic body. Songoskriti's
    // expectations are NOT applied to Somvabona — Decision **D3** scopes the
    // table to Songoskriti.
    const issues = checkTemplateDistinctness(
      "search",
      { main: genericDemoMain("search", plainBuilder()) },
      {
        expectations: {},
        peerMainTypes: previewSourceMainTypes(source),
      },
    );
    expect(issues.map((issue) => issue.rule)).toEqual(
      expect.arrayContaining(["R1-not-generic"]),
    );
  });
});
