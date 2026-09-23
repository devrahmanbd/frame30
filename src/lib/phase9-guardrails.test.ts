/**
 * Phase 9 — guardrails, lint & tests.
 *
 * Every rule here is publish-blocking, so each one gets a violating fixture and
 * a clean fixture: a rule that cannot fail is not a guardrail.
 */
import { describe, expect, it } from "vitest";
import {
  TRANSLATION_PUBLISH_FLOOR,
  consentIssues,
  disclaimerIssues,
  guardrailIssues,
  moneyMathIssues,
  scrimIssues,
  translationGate,
} from "./builder-guardrails";
import {
  TEMPLATE_KEYS,
  lintTemplate,
  parseAst,
  type Section,
  type SectionType,
  type TemplateKey,
} from "./builder-ast";
import { translationCoverage } from "./translation-coverage";
import { WIDGET_TYPES } from "./widget-registry";
import { hydrationMode } from "./widget-hydration";

function node(
  type: SectionType | string,
  props: Record<string, unknown> = {},
): Section {
  return {
    id: `n_${type}`,
    type: type as SectionType,
    props,
    bp: {},
    children: [],
  } as unknown as Section;
}

describe("content guardrails", () => {
  it("blocks text over an image with no scrim", () => {
    expect(
      scrimIssues([
        node("category_header", {
          imageUrl: "https://x/y.jpg",
          heading: "Sale",
          scrim: false,
        }),
      ]),
    ).toHaveLength(1);
    expect(
      scrimIssues([
        node("category_header", {
          imageUrl: "https://x/y.jpg",
          heading: "Sale",
          scrim: true,
        }),
      ]),
    ).toHaveLength(0);
    // An image with no copy over it is just an image.
    expect(
      scrimIssues([node("image", { imageUrl: "https://x/y.jpg", alt: "y" })]),
    ).toHaveLength(0);
  });

  it("blocks a before/after pair with no disclaimer", () => {
    expect(
      disclaimerIssues([node("before_after", { disclaimer: "" })]),
    ).toHaveLength(1);
    expect(
      disclaimerIssues([node("before_after", { disclaimer: "Results vary." })]),
    ).toHaveLength(0);
  });

  it("blocks a pre-checked consent control", () => {
    expect(
      consentIssues([node("newsletter", { consentChecked: true })]),
    ).toHaveLength(1);
    expect(
      consentIssues([node("newsletter", { marketingOptInDefault: "true" })]),
    ).toHaveLength(1);
    expect(
      consentIssues([
        node("newsletter", { consentText: "You agree to our policy." }),
      ]),
    ).toHaveLength(0);
  });

  it("blocks client-side money math in a widget prop", () => {
    expect(
      moneyMathIssues([
        node("price_block", { priceLabel: "{{ price * 0.8 }}" }),
      ]),
    ).toHaveLength(1);
    expect(
      moneyMathIssues([
        node("cart_summary", { totalNote: "${subtotal + shipping}" }),
      ]),
    ).toHaveLength(1);
    expect(
      moneyMathIssues([node("price_block", { priceLabel: "৳1,200" })]),
    ).toHaveLength(0);
  });

  it("reports every guardrail from one walk", () => {
    const issues = guardrailIssues([
      node("category_header", {
        imageUrl: "https://x/y.jpg",
        heading: "Sale",
        scrim: false,
      }),
      node("before_after", { disclaimer: "" }),
      node("newsletter", { consentChecked: true }),
      node("price_block", { priceLabel: "{{price*2}}" }),
    ]);
    expect(issues).toHaveLength(4);
    expect(issues.every((issue) => issue.level === "error")).toBe(true);
  });

  it("keeps the raw-colour rule publish-blocking", () => {
    const ast = parseAst({
      main: [{ id: "a", type: "heading", props: { text: "#ff0000 sale" } }],
    });
    const issues = lintTemplate(ast, "index");
    expect(
      issues.some((i) => i.level === "error" && /Raw colour/.test(i.message)),
    ).toBe(true);
  });

  it("allows only one <h1> claimant per template", () => {
    const ast = parseAst({
      main: [
        { id: "a", type: "category_header", props: { heading: "One" } },
        { id: "b", type: "category_header", props: { heading: "Two" } },
      ],
    });
    expect(
      lintTemplate(ast, "collection").some((i) =>
        /claims the page <h1>/.test(i.message),
      ),
    ).toBe(true);
  });
});

describe("translation gate", () => {
  it("blocks publish below the coverage floor and passes above it", () => {
    expect(translationGate({ ok: 70, fallback: 30 })).toHaveLength(1);
    expect(translationGate({ ok: 95, fallback: 5 })).toHaveLength(0);
    // Fields nobody authored on either side are not untranslated strings.
    expect(translationGate({ ok: 0, fallback: 0 })).toHaveLength(0);
    expect(TRANSLATION_PUBLISH_FLOOR).toBe(90);
  });
});

describe("widget hydration modes", () => {
  it("assigns every registered widget a hydration mode, so no theme owns a renderer branch", () => {
    for (const type of WIDGET_TYPES) {
      expect(["static", "eager", "visible", "interaction"]).toContain(
        hydrationMode(type),
      );
    }
  });
});
