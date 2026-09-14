import { describe, expect, it } from "vitest";
import {
  ROUTE_H1_TEMPLATES,
  SECTION_CATALOG,
  lintTemplate,
  newSection,
  parseAst,
  routeSuppliesH1,
  type Section,
  type TemplateKey,
} from "./builder-ast";
import { JSONLD_SINGLETONS, collectJsonLd, sectionJsonLd } from "./structured-data";
import { answerBlockIssues } from "./seo-answers";
import { presetSeoTemplates } from "./theme-seo";
import { SEO_TEMPLATE_VARS, templateIssues } from "./seo-answers";
import { THEME_PRESETS } from "./theme-presets";

const ctx = { storeName: "Store", url: "https://shop.example.com/store/demo" };

/** `newSection` mints a random id; tests need stable ones. */
function mk(type: Parameters<typeof newSection>[0], id: string): Section {
  return { ...newSection(type), id };
}

function ast(main: Section[]) {
  return parseAst({ header: [], main, footer: [] });
}

function faq(id: string): Section {
  return { ...mk("faq", id), props: { ...mk("faq", id).props, q1: "Is it real?", a1: "Yes." } };
}

describe("Phase 5 — one declared <h1> claimant per template", () => {
  it("declares which templates take their h1 from route data", () => {
    expect([...ROUTE_H1_TEMPLATES]).toEqual(["product", "collection", "page", "blog", "search"]);
    expect(routeSuppliesH1("index")).toBe(false);
    expect(routeSuppliesH1("product")).toBe(true);
  });

  it("does not ask a route-h1 template for a primary heading", () => {
    const issues = lintTemplate(ast([mk("rich_text", "s1")]), "product");
    expect(issues.some((i) => i.message === "No primary heading on this template.")).toBe(false);
  });

  it("still asks every other template for one", () => {
    const issues = lintTemplate(ast([mk("rich_text", "s1")]), "index");
    expect(issues.some((i) => i.message === "No primary heading on this template.")).toBe(true);
  });

  it("allows exactly one claimant and blocks a second, on every template", () => {
    const claimants = SECTION_CATALOG.filter(
      (e) => e.heading && e.type !== "heading" && e.slots.includes("main"),
    ).slice(0, 2);
    const one = lintTemplate(ast([mk(claimants[0]!.type, "s1")]), "product" as TemplateKey);
    expect(one.some((i) => /claims the page <h1>/.test(i.message))).toBe(false);
    const two = lintTemplate(
      ast([mk(claimants[0]!.type, "s1"), mk(claimants[1]!.type, "s2")]),
      "product" as TemplateKey,
    );
    expect(two.some((i) => /claims the page <h1>/.test(i.message))).toBe(true);
  });
});

describe("Phase 5 — JSON-LD singletons", () => {
  it("treats Product, ItemList and BreadcrumbList as page-level singletons", () => {
    for (const type of ["FAQPage", "HowTo", "Article", "Product", "ItemList", "BreadcrumbList"]) {
      expect(JSONLD_SINGLETONS.has(type)).toBe(true);
    }
  });

  it("emits FAQPage from a care panel", () => {
    const care = mk("care_panel", "c1");
    const node = sectionJsonLd(
      { ...care, props: { ...care.props, composition: "100% cotton", care: "Cold wash" } },
      ctx,
    );
    expect(node?.["@type"]).toBe("FAQPage");
    expect(sectionJsonLd(care, ctx)).toBeNull();
  });

  it("never ships two FAQPage graphs — faq or care_panel, never both", () => {
    const care = mk("care_panel", "c1");
    const filled = { ...care, props: { ...care.props, composition: "Cotton" } };
    const nodes = collectJsonLd([faq("f1"), filled], ctx);
    expect(nodes.filter((n) => n["@type"] === "FAQPage")).toHaveLength(1);
    const issues = lintTemplate(ast([faq("f1"), filled]), "product");
    expect(issues.some((i) => /second FAQPage/.test(i.message))).toBe(true);
  });
});

describe("Phase 5 — answer blocks stay crawlable", () => {
  const nested = (container: string): Section[] => [
    { ...mk(container as never, "wrap"), children: [faq("f1")] } as Section,
  ];

  it("blocks an answer block inside a client-only container", () => {
    const issues = answerBlockIssues(nested("quick_view"));
    expect(issues.some((i) => i.level === "error" && /client-only/.test(i.message))).toBe(true);
  });

  it("still blocks a sandboxed HTML island", () => {
    const issues = answerBlockIssues(nested("html"));
    expect(issues.some((i) => i.level === "error")).toBe(true);
  });

  it("warns — but does not block — inside a tab panel", () => {
    const issues = answerBlockIssues(nested("tabs"));
    expect(issues.every((i) => i.level === "warn")).toBe(true);
    expect(issues.some((i) => /tab panel/.test(i.message))).toBe(true);
  });

  it("leaves a top-level answer block alone", () => {
    expect(answerBlockIssues([faq("f1")])).toEqual([]);
  });
});

describe("Phase 5 — seo_templates ship with every preset", () => {
  it("returns one valid row per content type for every preset", () => {
    for (const preset of THEME_PRESETS) {
      const rows = presetSeoTemplates(preset.key);
      expect(rows.map((r) => r.entityType)).toEqual(["product", "collection", "page", "article"]);
      for (const row of rows) {
        expect(templateIssues(row.titleTemplate)).toEqual([]);
        expect(templateIssues(row.descriptionTemplate)).toEqual([]);
        expect(row.titleTemplate).toContain("{{title}}");
      }
    }
  });

  it("only interpolates supported variables", () => {
    const used = new Set<string>();
    for (const preset of THEME_PRESETS)
      for (const row of presetSeoTemplates(preset.key))
        for (const m of `${row.titleTemplate} ${row.descriptionTemplate}`.matchAll(/\{\{(\w+)\}\}/g))
          used.add(m[1]!);
    for (const name of used) expect(SEO_TEMPLATE_VARS).toContain(name as never);
  });
});
