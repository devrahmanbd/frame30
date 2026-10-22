/**
 * The theme's COMMERCE and ACCOUNT compositions — the contract that the
 * composable pieces are actually used.
 *
 * **What is under test.** The theme's `cart`, `checkout` and `account` bodies
 * (`src/lib/themes/songoskriti/preview.ts`) are the surfaces the composable
 * parts contract exists for: they place the platform's commerce widgets
 * (`cart_lines`, `cart_summary`, `payment_methods`, `checkout_steps`) and the
 * account's four placeable panels (`account_nav`, `account_overview`,
 * `account_orders`, `account_details`), and each widget **authors its own
 * arrangement** through the `parts` prop.
 *
 * **The three things that must hold.**
 *
 *  1. **The theme states its own arrangement.** Every `parts` value the theme
 *     authors is drawn from the CLOSED vocabulary (`WIDGET_PART_VOCABULARY`),
 *     so a part key outside the vocabulary can never reach a renderer. The
 *     suite reads `preview.ts` as **text** — the same "read it as text"
 *     pattern the repo already uses (`src/lib/preview-parity.contract.test.ts`)
 *     — so a `parts` value that is not even a declared field is caught here.
 *  2. **The authored props survive.** `parseSection` copies ONLY the props a
 *     widget's catalogue row declares, so an authored prop that is not
 *     declared is **silently dropped on save**. The suite parses the three
 *     compositions through `parseTemplates` and asserts every authored prop
 *     survives with the same value.
 *  3. **The account's body stays a FRAME.** It places at least one of the
 *     four `account_*` panels AND carries the route-owned body slot
 *     (`page_content`), so the dashboard's own fallback still renders
 *     everything the theme did not place — the "no blank required slot" rule.
 *     It places **no** `orders_list`: the dashboard's orders panel renders
 *     the shopper's orders as structured rows, and the widget's plain list
 *     beside them would show the same orders twice (the reason the prior
 *     composition dropped it).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  catalogEntry,
  flattenSections,
  parseTemplates,
  type PropValue,
  type Section,
  type SectionBuilder,
  type SectionType,
  type ThemeAst,
} from "../../builder-ast";
import { WIDGET_PART_VOCABULARY } from "../../widget-parts";
import { songoskritiPreviewSource } from "./preview";

/** The plain builder the engine uses — the theme's own default/variation
 *  wrap happens INSIDE `main` (`src/lib/themes/songoskriti/preview.ts`). */
function plainBuilder(): SectionBuilder {
  let n = 0;
  return (type, props = {}) => ({
    id: `${type}-${n++}`,
    type,
    props: { ...props },
  });
}

/** The theme's own body for one template. */
function body(template: string): Section[] {
  return (
    songoskritiPreviewSource().main(template as never, plainBuilder()) ?? []
  );
}

/** The theme's own source, read as TEXT — the authored `parts` values. */
const PREVIEW_SRC = readFileSync(
  new URL("./preview.ts", import.meta.url),
  "utf8",
);

/** The four account panels the theme may place. */
const ACCOUNT_PANELS: readonly SectionType[] = [
  "account_nav",
  "account_overview",
  "account_orders",
  "account_details",
];

/**
 * Every authored `parts` value in the theme's source, with the widget type it
 * belongs to.
 *
 * The pattern is the theme's own builder call — `s("cart_lines", { … })` —
 * so the type and its props are read together. A `parts` value written
 * outside a builder call is not an authored value and is not read here; the
 * "declared and surviving" case below catches it instead (an undeclared prop
 * never reaches the AST).
 */
function authoredParts(): { type: string; parts: string }[] {
  const out: { type: string; parts: string }[] = [];
  const call = /s\(\s*"([a-z_]+)"\s*,\s*\{([\s\S]*?)\}\s*\)/g;
  for (const match of PREVIEW_SRC.matchAll(call)) {
    const type = match[1]!;
    const body = match[2]!;
    const parts = /parts:\s*"([^"]*)"/.exec(body);
    if (parts) out.push({ type, parts: parts[1]! });
  }
  return out;
}

/** The section with the given id inside a parsed body. */
function findById(sections: Section[], id: string): Section | undefined {
  for (const section of flattenSections(sections)) {
    if (section.id === id) return section;
  }
  return undefined;
}

/** The prop value the theme authored for one widget type, or undefined. */
function authoredProp(
  sections: Section[],
  type: SectionType,
  key: string,
): PropValue | undefined {
  for (const section of flattenSections(sections)) {
    if (section.type !== type) continue;
    const value = section.props[key];
    if (value !== undefined) return value;
  }
  return undefined;
}

describe("songoskriti commerce compositions — the composable pieces are used", () => {
  it("the cart composition places cart_lines and cart_summary, each with an authored parts order", () => {
    const main = body("cart");
    const types = flattenSections(main).map((section) => section.type);
    expect(types).toContain("cart_lines");
    expect(types).toContain("cart_summary");

    const lines = authoredProp(main, "cart_lines", "parts");
    const summary = authoredProp(main, "cart_summary", "parts");
    expect(typeof lines, "cart_lines must author a parts order").toBe("string");
    expect(typeof summary, "cart_summary must author a parts order").toBe(
      "string",
    );

    // Both orders are drawn from the CLOSED vocabulary — every token is a
    // known part of that widget, and no token repeats.
    for (const [type, raw] of [
      ["cart_lines", lines as string],
      ["cart_summary", summary as string],
    ] as const) {
      const allowed = WIDGET_PART_VOCABULARY[type] ?? [];
      expect(allowed.length, `${type} must have a vocabulary`).toBeGreaterThan(
        0,
      );
      const tokens = raw.split(",").map((token) => token.trim());
      expect(tokens.length).toBeGreaterThan(0);
      for (const token of tokens) {
        expect(
          allowed,
          `${type}.parts names "${token}", which is outside the closed vocabulary`,
        ).toContain(token);
      }
      expect(new Set(tokens).size, `${type}.parts repeats a part`).toBe(
        tokens.length,
      );
    }
  });

  it("the checkout composition places payment_methods, cart_summary and checkout_steps, each with an authored parts order", () => {
    const main = body("checkout");
    const types = flattenSections(main).map((section) => section.type);
    for (const type of [
      "payment_methods",
      "cart_summary",
      "checkout_steps",
    ] as const) {
      expect(types, `the checkout must place ${type}`).toContain(type);
      const raw = authoredProp(main, type, "parts");
      expect(typeof raw, `${type} must author a parts order`).toBe("string");
      const allowed = WIDGET_PART_VOCABULARY[type] ?? [];
      for (const token of (raw as string).split(",").map((t) => t.trim())) {
        expect(
          allowed,
          `${type}.parts names "${token}", which is outside the closed vocabulary`,
        ).toContain(token);
      }
    }
  });

  it("the account composition places an account panel and keeps the route-owned body slot", () => {
    const main = body("account");
    const types = flattenSections(main).map((section) => section.type);
    // At least ONE of the four placeable panels …
    expect(
      types.filter((type) => ACCOUNT_PANELS.includes(type)),
      "the account composition must place at least one account panel",
    ).not.toEqual([]);
    // … and the route-owned body slot, so the dashboard's own fallback still
    // renders everything the theme did not place.
    expect(types).toContain("page_content");
  });

  it("the account composition places NO orders_list — the dashboard renders the orders", () => {
    const main = body("account");
    const types = flattenSections(main).map((section) => section.type);
    expect(types).not.toContain("orders_list");
  });

  it("every authored parts value in the theme's source is inside the closed vocabulary", () => {
    const authored = authoredParts();
    expect(
      authored.length,
      "the theme must author parts orders",
    ).toBeGreaterThan(0);
    for (const { type, parts } of authored) {
      const allowed = WIDGET_PART_VOCABULARY[type as SectionType] ?? [];
      expect(
        allowed.length,
        `${type} authors a parts order but has no closed vocabulary`,
      ).toBeGreaterThan(0);
      for (const token of parts.split(",").map((t) => t.trim())) {
        expect(
          allowed,
          `${type}.parts names "${token}", which is outside the closed vocabulary`,
        ).toContain(token);
      }
    }
  });

  it("every authored prop of the three commerce compositions survives parseTemplates", () => {
    const problems: string[] = [];
    for (const template of ["cart", "checkout", "account"]) {
      const main = body(template);
      const ast: ThemeAst = { header: [], main, footer: [] };
      const parsed = parseTemplates({ [template]: ast });
      const parsedMain = parsed[template]?.main;
      if (!parsedMain) {
        problems.push(
          `${template}: the template did not survive parseTemplates`,
        );
        continue;
      }
      for (const section of flattenSections(main)) {
        const entry = catalogEntry(section.type);
        if (!entry) {
          problems.push(`${template}: unknown widget type ${section.type}`);
          continue;
        }
        const declared = new Set(entry.fields.map((field) => field.key));
        // A `bitext` field's বাংলা sibling travels with it (`withBiText`),
        // so the sibling is a declared prop even though it is not a field.
        for (const field of entry.fields) {
          if (field.kind === "bitext") declared.add(`${field.key}_bn`);
        }
        for (const [prop, value] of Object.entries(section.props)) {
          if (!declared.has(prop)) {
            problems.push(
              `${template}: ${section.type}.${prop} is not a declared field — the sanitiser drops it on save`,
            );
            continue;
          }
          const parsedSection = findById(parsedMain, section.id);
          if (!parsedSection) {
            problems.push(
              `${template}: ${section.type} was dropped by parseTemplates`,
            );
            continue;
          }
          const survived = parsedSection.props[prop];
          if (survived === undefined) {
            problems.push(
              `${template}: ${section.type}.${prop} did not survive parseTemplates`,
            );
            continue;
          }
          if (survived !== value) {
            problems.push(
              `${template}: ${section.type}.${prop} changed across parseTemplates (${JSON.stringify(
                value,
              )} → ${JSON.stringify(survived)})`,
            );
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
