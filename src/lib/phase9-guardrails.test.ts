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
import { THEME_PRESETS } from "./theme-presets";
import { SHIPPED_BLUEPRINT_KEYS } from "./theme-blueprints";
import { translationCoverage } from "./translation-coverage";
import { WIDGET_TYPES } from "./widget-registry";
import { hydrationMode } from "./widget-hydration";

function node(type: SectionType | string, props: Record<string, unknown> = {}): Section {
  return { id: `n_${type}`, type: type as SectionType, props, bp: {}, children: [] } as unknown as Section;
}

describe("content guardrails", () => {
  it("blocks text over an image with no scrim", () => {
    expect(scrimIssues([node("category_header", { imageUrl: "https://x/y.jpg", heading: "Sale", scrim: false })])).toHaveLength(1);
    expect(scrimIssues([node("category_header", { imageUrl: "https://x/y.jpg", heading: "Sale", scrim: true })])).toHaveLength(0);
    // An image with no copy over it is just an image.
    expect(scrimIssues([node("image", { imageUrl: "https://x/y.jpg", alt: "y" })])).toHaveLength(0);
  });

  it("blocks a before/after pair with no disclaimer", () => {
    expect(disclaimerIssues([node("before_after", { disclaimer: "" })])).toHaveLength(1);
    expect(disclaimerIssues([node("before_after", { disclaimer: "Results vary." })])).toHaveLength(0);
  });

  it("blocks a pre-checked consent control", () => {
    expect(consentIssues([node("newsletter", { consentChecked: true })])).toHaveLength(1);
    expect(consentIssues([node("newsletter", { marketingOptInDefault: "true" })])).toHaveLength(1);
    expect(consentIssues([node("newsletter", { consentText: "You agree to our policy." })])).toHaveLength(0);
  });

  it("blocks client-side money math in a widget prop", () => {
    expect(moneyMathIssues([node("price_block", { priceLabel: "{{ price * 0.8 }}" })])).toHaveLength(1);
    expect(moneyMathIssues([node("cart_summary", { totalNote: "${subtotal + shipping}" })])).toHaveLength(1);
    expect(moneyMathIssues([node("price_block", { priceLabel: "৳1,200" })])).toHaveLength(0);
  });

  it("reports every guardrail from one walk", () => {
    const issues = guardrailIssues([
      node("category_header", { imageUrl: "https://x/y.jpg", heading: "Sale", scrim: false }),
      node("before_after", { disclaimer: "" }),
      node("newsletter", { consentChecked: true }),
      node("price_block", { priceLabel: "{{price*2}}" }),
    ]);
    expect(issues).toHaveLength(4);
    expect(issues.every((issue) => issue.level === "error")).toBe(true);
  });

  it("keeps the raw-colour rule publish-blocking", () => {
    const ast = parseAst({ main: [{ id: "a", type: "heading", props: { text: "#ff0000 sale" } }] });
    const issues = lintTemplate(ast, "index");
    expect(issues.some((i) => i.level === "error" && /Raw colour/.test(i.message))).toBe(true);
  });

  it("allows only one <h1> claimant per template", () => {
    const ast = parseAst({
      main: [
        { id: "a", type: "category_header", props: { heading: "One" } },
        { id: "b", type: "category_header", props: { heading: "Two" } },
      ],
    });
    expect(lintTemplate(ast, "collection").some((i) => /claims the page <h1>/.test(i.message))).toBe(true);
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

describe("preset conformance", () => {
  const presets = THEME_PRESETS;

  it("ships all four themes", () => {
    expect(presets.length).toBeGreaterThanOrEqual(4);
  });

  it("round-trips and lints clean across every template of every preset", () => {
    for (const preset of presets) {
      for (const key of TEMPLATE_KEYS) {
        const source = preset.templates[key as TemplateKey];
        if (!source) continue;
        const parsed = parseAst(source);
        expect(JSON.parse(JSON.stringify(parseAst(parsed)))).toEqual(JSON.parse(JSON.stringify(parsed)));
        const errors = lintTemplate(parsed, key as TemplateKey).filter((i) => i.level === "error");
        expect(errors, `${preset.key}/${key}: ${errors.map((e) => e.message).join(" · ")}`).toEqual([]);
      }
    }
  });

  it("keeps বাংলা coverage above the publish floor for every preset", () => {
    for (const preset of presets) {
      const stats = translationCoverage(preset.templates as never);
      expect(translationGate(stats), `${preset.key} at ${stats.percent}%`).toEqual([]);
    }
  });
});

describe("registry sharing", () => {
  it("shares at least 70% of widgets across more than one theme", () => {
    const usage = new Map<string, Set<string>>();
    // Blueprint presets intentionally place widgets the ten general presets
    // never use, so the sharing ratio is measured over the general presets;
    // blueprint coverage is asserted in definition-of-done.test.ts.
    const blueprintKeys = new Set<string>(SHIPPED_BLUEPRINT_KEYS);
    for (const preset of THEME_PRESETS.filter((p) => !blueprintKeys.has(p.key))) {
      for (const key of TEMPLATE_KEYS) {
        const ast = preset.templates[key as TemplateKey];
        if (!ast) continue;
        const walk = (nodes: Section[]) => {
          for (const item of nodes) {
            if (!usage.has(item.type)) usage.set(item.type, new Set());
            usage.get(item.type)!.add(preset.key);
            if (item.children?.length) walk(item.children);
          }
        };
        const parsed = parseAst(ast);
        walk([...parsed.header, ...parsed.main, ...parsed.footer]);
      }
    }
    const used = [...usage.values()];
    const shared = used.filter((themes) => themes.size > 1).length;
    expect(used.length).toBeGreaterThan(0);
    expect(shared / used.length).toBeGreaterThanOrEqual(0.7);
  });

  it("assigns every registered widget a hydration mode, so no theme owns a renderer branch", () => {
    for (const type of WIDGET_TYPES) {
      expect(["static", "eager", "visible", "interaction"]).toContain(hydrationMode(type));
    }
  });
});
