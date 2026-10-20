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
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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

/**
 * The engine's generic demo shapes — the two the gate reads **per template**
 * (`templateDemoSections`, `template-distinctness.ts`): the engine's generic
 * shapes minus the ones the template's own row *requires* (`product_rail` is
 * a required type on `index`, so a rail on the homepage is the theme's own
 * composition, not a demo shape).
 */
const ENGINE_GENERIC_DEMO_SHAPES = ["rich_text", "product_rail"] as const;

function demoShapesFor(template: TemplateKey): string[] {
  const required = SONOSKRITI_TEMPLATE_EXPECTATIONS[template].requiredTypes;
  return ENGINE_GENERIC_DEMO_SHAPES.filter(
    (shape) => !required.includes(shape as SectionType),
  );
}

/**
 * A body with TWO `heading: true` widgets that are not the `heading` type —
 * the shipped cart body's shape BEFORE Task 6 fixed it (the lines block and
 * the summary both claimed the page `<h1>`).
 */
function twoClaimantCartBody(): Section[] {
  const body = fixtureBody(["heading", "columns"]);
  const columns = body[1];
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
  return body;
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

  it("accepts the shipped bodies opened with an editorial heading — the next legitimate change must pass", () => {
    // The regression this locks: the shipped `index` and `collection` bodies
    // are the two whose rows declare NO functional slots, so the old
    // slots-only clause of `R1` was vacuous for them — ANY heading-led body
    // that carried a `product_rail` tripped the rule. Prepending a plain
    // intro heading to a body that actually ships is exactly the change the
    // gate must allow (measured before the fix: `R1-not-generic` on both).
    for (const key of ["index", "collection"] as const) {
      const main = shippedMain(key);
      const led: Section[] = [
        {
          id: "intro-heading",
          type: "heading",
          props: { text: "Editorial intro", text_bn: "সম্পাদকীয় পরিচিতি" },
        },
        ...main,
      ];

      // The fixture really is the shape that used to trip the gate: it is
      // heading-led and it carries the demo shape the old rule treated as
      // "demo" on every template.
      expect(led[0]!.type, "the fixture must be heading-led").toBe("heading");
      expect(
        led.map((section) => section.type),
        "the fixture must carry the rail the old rule called a demo shape",
      ).toContain("product_rail");

      const issues = checkSongoskritiTemplateDistinctness(key, { main: led });
      expect(
        issues.map((issue) => `${issue.rule}: ${issue.message}`),
        `the shipped ${key} body opened with a heading must pass the gate`,
      ).toEqual([]);
    }
  });

  it("still rejects a heading-plus-demo-rail body on every template", () => {
    for (const key of TEMPLATE_KEYS) {
      // (a) the engine's own generic body — the exact-body clause.
      const generic = genericDemoMain(key, plainBuilder());
      expect(
        ruleIdsOf(key, generic),
        `the engine's generic body must be rejected on ${key}`,
      ).toEqual(expect.arrayContaining(["R1-not-generic"]));

      // (b) the heading-led clause: a body that opens with a heading and
      // carries the template's generic demo shapes while missing the
      // template's own composition. The trailing filler section keeps the
      // body from BEING the engine's generic body, so this exercises the
      // heading-led clause and not the exact-body clause.
      const demoShapes = demoShapesFor(key);
      expect(
        demoShapes.length,
        `the ${key} row must leave at least one generic demo shape`,
      ).toBeGreaterThan(0);
      const body = fixtureBody(["heading", ...demoShapes, "image"]);
      expect(
        ruleIdsOf(key, body),
        `a heading-plus-demo-rail body must be rejected on ${key}`,
      ).toEqual(expect.arrayContaining(["R1-not-generic"]));
    }
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

    // The COMPOUND demo markers a word-boundary match misses: `DemoPage` in
    // a value and `demo_page` in a prop KEY.
    const compoundPage = fixtureBody(["breadcrumb", "page_content"], {
      page_content: { body: "DemoPage fallback" },
    });
    expect(ruleIdsOf("page", compoundPage)).toEqual(
      expect.arrayContaining(["R4-no-demo-copy"]),
    );
    const keyMarkerPage = fixtureBody(["breadcrumb", "page_content"], {
      page_content: { demo_page: "fallback" },
    });
    expect(ruleIdsOf("page", keyMarkerPage)).toEqual(
      expect.arrayContaining(["R4-no-demo-copy"]),
    );

    // The six retired strings are still matched as EXACT substrings.
    for (const retired of [
      "Demo search",
      "Meet the makers",
      "Size guide",
      "How to measure",
      "Demo article",
      "Demo story",
    ]) {
      const retiredPage = fixtureBody(["breadcrumb", "page_content"], {
        page_content: { body: retired },
      });
      expect(
        ruleIdsOf("page", retiredPage),
        `the retired demo string "${retired}" must be caught`,
      ).toEqual(expect.arrayContaining(["R4-no-demo-copy"]));
    }

    // R7 — a body carrying TWO `heading: true` widgets that are not the
    // `heading` type: the shipped cart body's shape BEFORE Task 6 fixed it
    // (the lines block and the summary both claimed the page `<h1>`).
    const twoClaimants = twoClaimantCartBody();
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

  it("counts the <h1> claimants over the body — and says so in the finding", () => {
    // The KNOWN LIMIT of `R7`: the count is over the BODY under test, while
    // the platform counts the WHOLE AST — it flattens header + main + footer
    // (`src/lib/builder-ast.ts:8496-8514`). The two counts are equal today:
    // measured, the theme's chrome contributes no claimant — the header AST
    // is empty (the storefront's `StoreHeader` renders the masthead) and the
    // footer is `footer_sitemap` + `rich_text`, both `heading: false` in the
    // catalogue. A future heading-capable chrome widget would make the
    // platform's count one higher — so the finding states its own scope.
    const source = songoskritiPreviewSource();
    const chromeTypes = new Set<SectionType>();
    for (const key of TEMPLATE_KEYS) {
      for (const section of [
        ...source.header(key, plainBuilder()),
        ...source.footer(key, plainBuilder()),
      ]) {
        chromeTypes.add(section.type);
      }
    }
    expect([...chromeTypes].sort()).toEqual(["footer_sitemap", "rich_text"]);
    for (const type of chromeTypes) {
      expect(
        catalogEntry(type)?.heading,
        `the chrome widget ${type} must not claim the page <h1>`,
      ).toBe(false);
    }

    const finding = checkSongoskritiTemplateDistinctness("cart", {
      main: twoClaimantCartBody(),
    }).find((issue) => issue.rule === "R7-one-primary-heading");
    expect(finding, "the two-claimant body must trip R7").toBeDefined();
    expect(finding?.message).toContain("count scope");
    expect(finding?.message).toContain("the BODY under test");
    expect(finding?.details.join(" ")).toContain(
      "the platform counts the whole AST",
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

    // The rule-id list above cannot see a future `lintTemplate` import, so
    // the module's OWN SOURCE is read here: the gate stays
    // composition-only — it never imports the platform's lint.
    const moduleSource = readFileSync(
      fileURLToPath(new URL("./template-distinctness.ts", import.meta.url)),
      "utf8",
    );
    const importStatements =
      moduleSource.match(/^import[\s\S]*?from\s+"[^"]+";/gm) ?? [];
    expect(
      importStatements.length,
      "the module must have import statements",
    ).toBeGreaterThan(0);
    expect(
      importStatements.join("\n"),
      "the gate must not import the platform's lint",
    ).not.toContain("lintTemplate");
    expect(
      moduleSource,
      "the gate must not call the platform's lint",
    ).not.toMatch(/\blintTemplate\s*\(/);
  });
});

describe("the distinctness gate is theme-agnostic", () => {
  it("rejects the engine's generic body for every template a theme does not author", () => {
    const source = somvabonaPreviewSource();

    // The PROPERTY, not the other theme's inventory: a template the theme
    // does not author has NO theme-owned body — the engine synthesises its
    // generic demo body (`assemblePreviewTemplates`,
    // `src/lib/theme-preview-nav.ts:400`) — and the gate rejects that body.
    // (The suite deliberately does NOT pin Somvabona's current inventory: the
    // day it authors a fourth surface the assertion must still hold.)
    let unAuthored = 0;
    for (const key of TEMPLATE_KEYS) {
      const main = source.main(key, plainBuilder());
      if (main !== null) {
        // An authored body is the theme's own — never the generic demo body.
        expect(
          main.map((section) => section.type),
          `the authored ${key} body must not be the engine's generic body`,
        ).not.toEqual(["heading", "rich_text"]);
        continue;
      }
      unAuthored += 1;

      // The fall-through body IS the engine's generic demo body ...
      const generic = genericDemoMain(key, plainBuilder());
      expect(
        generic.map((section) => section.type),
        `the ${key} fall-through body must be the engine's generic body`,
      ).toEqual(["heading", "rich_text"]);

      // ... and the gate REJECTS it. Songoskriti's expectations are NOT
      // applied to Somvabona — Decision **D3** scopes the table to
      // Songoskriti — so the gate runs here on the MACHINERY alone.
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
